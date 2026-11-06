/*
 * Generated Code using Deepseek 4.1 Flash high
 * Asked for validation script based on ODSA_config.py requirements
 * and field usage in the opendsa repo.
 */
import type { LoadedInstBook } from "./types";

export interface BookValidationResult {
  errors: string[];
  warnings: string[];
}

/**
 * Checks that a book can be handed to the OpenDSA compiler as-is.
 *
 * These are the failures that otherwise show up late as a compiler traceback
 * or, worse, as silently overwritten output:
 * - a module HTML filename is the basename of the module path, so two modules
 *   named `Foo` in different folders both write `lti_html/Foo.html`;
 * - the postprocessor assumes `<folder>/<module>` and takes `split("/")[1]`;
 * - external-tool sections need a launch base URL and a backing exercise row;
 * - the postprocessor concatenates `LMS_url`, so the book must at least have a
 *   course offering to produce one.
 *
 * Missing Canvas ids are not an error: the compiler still succeeds, but the
 * `lti_html` internal links become placeholders until a Canvas sync runs.
 */
export function validateBookForCompile(
  instBook: LoadedInstBook,
  options: { extrtoolLaunchBaseUrl?: string } = {}
): BookValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!instBook.course_offering) {
    errors.push(
      "Book has no course offering; the compiler output path and LMS URL cannot be determined."
    );
  }

  if (instBook.inst_chapters.length === 0) {
    warnings.push("Book has no chapters.");
  }

  const modulesByBasename = new Map<string, string[]>();
  const modulePaths = new Set<string>();
  let hasLearningTool = false;

  for (const chapter of instBook.inst_chapters) {
    if (chapter.inst_chapter_modules.length === 0) {
      warnings.push(`Chapter "${chapter.name}" has no modules.`);
    }

    for (const chapterModule of chapter.inst_chapter_modules) {
      const path = chapterModule.inst_module?.path?.trim();
      if (!path) {
        errors.push(
          `Chapter "${chapter.name}" contains a module without a path.`
        );
        continue;
      }

      const parts = path.split("/");
      if (parts.length > 2) {
        errors.push(
          `Module "${path}" is nested more than one folder deep; the postprocessor only supports "<folder>/<module>".`
        );
      }

      if (modulePaths.has(path)) {
        errors.push(
          `Module "${path}" appears more than once in the book; configure.py rejects duplicate modules.`
        );
      }
      modulePaths.add(path);

      const basename = parts[parts.length - 1];
      if (!basename) {
        errors.push(`Module path "${path}" has an empty file name.`);
      } else {
        modulesByBasename.set(basename, [
          ...(modulesByBasename.get(basename) ?? []),
          path,
        ]);
      }

      if (
        (chapterModule.lms_module_item_id != null ||
          chapterModule.lms_assignment_id != null) &&
        (!instBook.course_offering?.lms_instance.url ||
          !instBook.course_offering?.lms_course_num)
      ) {
        warnings.push(
          `Module "${path}" has LMS ids but the book has no LMS URL/course id; internal links will be placeholders.`
        );
      }

      const exerciseNames = new Set<string>();

      for (const section of chapterModule.inst_sections) {
        if (section.learning_tool) {
          hasLearningTool = true;

          if (!section.resource_name?.trim()) {
            errors.push(
              `Learning-tool section "${section.name}" in "${path}" has no resource_name.`
            );
          }

          if (section.inst_book_section_exercises.length === 0) {
            errors.push(
              `Learning-tool section "${section.name}" in "${path}" has no exercise row.`
            );
          }
        }

        for (const sectionExercise of section.inst_book_section_exercises) {
          const shortName = sectionExercise.inst_exercise?.short_name?.trim();
          if (!shortName) {
            errors.push(
              `Section "${section.name}" in "${path}" has an exercise with no catalog entry (inst_exercise).`
            );
            continue;
          }

          if (!section.learning_tool) {
            if (exerciseNames.has(shortName)) {
              errors.push(
                `Section "${section.name}" in "${path}" lists exercise "${shortName}" more than once; one entry would overwrite the other.`
              );
            }
            exerciseNames.add(shortName);
          }
        }
      }
    }
  }

  for (const [basename, paths] of modulesByBasename) {
    if (paths.length > 1) {
      errors.push(
        `Modules ${paths
          .map((path) => `"${path}"`)
          .join(", ")} all produce "${basename}.html" and would overwrite each other.`
      );
    }
  }

  if (hasLearningTool && !options.extrtoolLaunchBaseUrl?.trim()) {
    errors.push(
      "Book contains a learning-tool section but extrtoolLaunchBaseUrl is empty."
    );
  }

  return { errors, warnings };
}
