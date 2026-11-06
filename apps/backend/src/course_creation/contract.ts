// ============================================================================
// OpenDSA Compiler Input Contract
// ============================================================================
//
// This module describes the JSON that `tools/configure.py` consumes via
// `ODSA_Config`, `ODSA_RST_Module`, and the LTI postprocessor. It is not a
// mirror of the old Rails `show.json.jbuilder`; it is the subset we actually
// need to send for a book to compile.
//
// Field references:
// - `ODSA_Config.validate_module` / `validate_exercise`: the upstream
//   allowlists. Unknown exercise fields make configure.py exit with an error,
//   which is why e.g. `partial_credit` must never be emitted.
// - `ODSA_RST_Module`: reads `sections[title].showsection`, plus exercise
//   `points`, `required`, `threshold`, `showhide`, `external_url`, `id`,
//   `exer_options`, `remove`, and the learning-tool fields below.
// - `postprocessor.get_module_map`: reads module `lms_module_item_id` and
//   `lms_assignment_id` to rewrite internal links to Canvas.
// - `postprocessor.break_up_sections`: reads top-level `LMS_url` and
//   `course_id`. It concatenates `LMS_url` without a null check, so those
//   values must always be strings.
// - `postprocessor.create_exercise_widget`: reads the compiler-generated
//   module-level `exercises` map (built from section exercise dictionaries).

/**
 * Exercise settings the compiler accepts inside a section dictionary.
 *
 * Keep in sync with `optional_fields` in `ODSA_Config.validate_exercise`.
 * `partial_credit` is intentionally absent: configure.py rejects it as an
 * unknown field.
 */
export const EXERCISE_CONFIG_FIELDS = [
  "exer_options",
  "long_name",
  "points",
  "remove",
  "required",
  "showhide",
  "threshold",
  "external_url",
  "type",
  "links",
  "scripts",
  "av_address",
  "mod_name",
  "url",
  "height",
  "width",
  "name",
  "splicetoolembed",
] as const;

/**
 * Fields a learning-tool section may carry. These are section metadata, not
 * exercise settings, so they are not subject to `validate_exercise`.
 * `ODSA_RST_Module` reads them for `extrtoolembed` directives and
 * `group_exercises` copies them into the module-level `exercises` map.
 */
export const LEARNING_TOOL_SECTION_FIELDS = [
  "long_name",
  "enable_scrolling",
  "frame_width",
  "frame_height",
  "learning_tool",
  "launch_url",
  "resource_name",
  "resource_type",
  "id",
  "points",
] as const;

export interface ExerciseCompileConfig extends Record<string, unknown> {
  id: number;
  long_name: string;
  required: boolean;
  points: number;
  threshold: number;
  exer_options?: unknown;
}

export interface SectionCompileConfig extends Record<string, unknown> {
  showsection: boolean;
}

export interface ModuleCompileConfig {
  lms_module_item_id: number | null;
  lms_assignment_id: number | null;
  long_name: string;
  due_dates: string | null;
  sections: Record<string, SectionCompileConfig> | null;
}

/** Chapters are keyed by module path, matching `configure.py`'s `chapters`. */
export type ChapterCompileConfig = Record<string, ModuleCompileConfig>;

/**
 * Top-level compiler input. Book options (`build_dir`, `lang`,
 * `glob_exer_options`, ...) are spread into this object, which is why the
 * index signature is required.
 */
export interface BookCompileInput extends Record<string, unknown> {
  inst_book_id: number;
  title: string;
  desc: string | null;
  last_compiled: string | null;
  chapters: Record<string, ChapterCompileConfig>;
  course_id: string;
  LMS_url: string;
}

function pickFields(
  source: Record<string, unknown> | null,
  fields: readonly string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!source) return result;
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      result[field] = source[field];
    }
  }
  return result;
}

/** Keep only compiler-supported exercise settings from the stored JSON blob. */
export function filterExerciseConfig(
  source: Record<string, unknown> | null
): Record<string, unknown> {
  return pickFields(source, EXERCISE_CONFIG_FIELDS);
}

/** Keep only the section fields the compiler understands for external tools. */
export function filterLearningToolSection(
  source: Record<string, unknown> | null
): Record<string, unknown> {
  return pickFields(source, LEARNING_TOOL_SECTION_FIELDS);
}
