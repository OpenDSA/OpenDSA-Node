import fs from "node:fs/promises";
import path from "node:path";
import { BookConfigJson, OpenDsaCompileResponse } from "./types";
import { sanitizeFilename } from "./utils";

// ============================================================================
// OpenDSA Compilation File Writing & Container Trigger
// ============================================================================

export interface WriteBookConfigFileParams {
  userId: number;
  compiledAt: Date;
  openDsaSharedDir: string;
  bookConfig: BookConfigJson;
}

export interface WrittenConfigFile {
  configPath: string;
  configFilePath: string;
}

export async function writeBookConfigFile(
  params: WriteBookConfigFileParams
): Promise<WrittenConfigFile> {
  const timestamp = params.compiledAt.toISOString();
  const configFile = `${sanitizeFilename(`temp_${params.userId}_${timestamp}`)}.json`;
  const configPath = `config/temp/${configFile}`;
  const configFilePath = path.join(params.openDsaSharedDir, configPath);

  await fs.mkdir(path.dirname(configFilePath), { recursive: true });
  await fs.writeFile(configFilePath, JSON.stringify(params.bookConfig), "utf8");

  return { configPath, configFilePath };
}

export async function triggerOpenDsaCompile(
  configApiLink: string,
  params: {
    configPath: string;
    buildPath: string;
    rake: boolean;
  }
): Promise<OpenDsaCompileResponse> {
  const formBody = new URLSearchParams({
    config_file_path: params.configPath,
    build_path: params.buildPath,
    rake: String(params.rake),
  });

  const response = await fetch(configApiLink, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formBody.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `OpenDSA compilation request to ${configApiLink} failed (${response.status}): ${errorText}`
    );
  }

  return (await response.json()) as OpenDsaCompileResponse;
}
