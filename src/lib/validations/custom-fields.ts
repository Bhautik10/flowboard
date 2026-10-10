import { CustomFieldType } from "@prisma/client";
import { z } from "zod";

const customFieldBaseSchema = z.object({
  name: z.string().trim().min(1).max(60).refine((name) => !name.startsWith("[Archived]"), "This prefix is reserved for archived fields."),
  type: z.nativeEnum(CustomFieldType),
  options: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  showOnCard: z.boolean().default(false),
  required: z.boolean().default(false),
  position: z.string().regex(/^[0-9A-Za-z]{1,128}$/).optional(),
}).strict();

function validateFieldConfiguration(value: { type?: CustomFieldType; options?: string[] }, context: z.RefinementCtx) {
  if (value.type === "DROPDOWN" && (!value.options?.length || new Set(value.options).size !== value.options.length)) {
    context.addIssue({ code: "custom", path: ["options"], message: "Dropdown fields need unique options." });
  }
  if (value.type !== "DROPDOWN" && value.options?.length) {
    context.addIssue({ code: "custom", path: ["options"], message: "Only dropdown fields can have options." });
  }
}

export const customFieldSchema = customFieldBaseSchema.superRefine(validateFieldConfiguration);

export const updateCustomFieldSchema = customFieldBaseSchema.partial().strict().superRefine((value, context) => {
  if (value.type !== undefined || value.options !== undefined) validateFieldConfiguration(value, context);
}).refine((value) => Object.keys(value).length > 0, { message: "Provide at least one field to update." });

export const customFieldValuesSchema = z.object({
  values: z.array(z.object({ fieldId: z.string().cuid(), value: z.unknown() }).strict()).max(100),
}).strict().superRefine(({ values }, context) => {
  if (new Set(values.map((entry) => entry.fieldId)).size !== values.length) context.addIssue({ code: "custom", path: ["values"], message: "Each custom field may appear once." });
});

export function validateCustomFieldValue(type: CustomFieldType, value: unknown, options: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  switch (type) {
    case "TEXT": return typeof value === "string" && value.length <= 2000;
    case "NUMBER": return typeof value === "number" && Number.isFinite(value);
    case "DATE": return typeof value === "string" && !Number.isNaN(Date.parse(value));
    case "CHECKBOX": return typeof value === "boolean";
    case "DROPDOWN": {
      const choices = Array.isArray(options) ? options : options && typeof options === "object" && "choices" in options ? (options as { choices?: unknown }).choices : undefined;
      return typeof value === "string" && Array.isArray(choices) && choices.includes(value);
    }
  }
}
