// A simple wrapper for the Canvas API for interacting with course creation.
// Replaces Pandarus


export interface CanvasCourse {
  id: number;
  course_code: string;
  name?: string;
}

export interface CanvasExternalTool {
  id: number;
  name: string;
}

export interface CanvasEntityWithId {
  id: number;
  [key: string]: unknown;
}

export class CanvasClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(lmsBaseUrl: string, accessToken: string) {
    const trimmed = lmsBaseUrl.replace(/\/+$/, "");
    this.baseUrl = trimmed.endsWith("/api/v1")
      ? trimmed
      : trimmed.endsWith("/api")
        ? `${trimmed}/v1`
        : `${trimmed}/api/v1`;
    this.token = accessToken;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `Canvas API ${method} ${endpoint} failed (${response.status}): ${errorText}`
      );
    }

    return (await response.json()) as T;
  }

  getSingleCourse(lmsCourseId: string): Promise<CanvasCourse> {
    return this.request<CanvasCourse>(
      "GET",
      `/courses/${encodeURIComponent(lmsCourseId)}`
    );
  }

  listExternalTools(lmsCourseId: string): Promise<CanvasExternalTool[]> {
    return this.request<CanvasExternalTool[]>(
      "GET",
      `/courses/${encodeURIComponent(lmsCourseId)}/external_tools`
    );
  }

  createExternalTool(
    lmsCourseId: string,
    payload: Record<string, unknown>
  ): Promise<CanvasEntityWithId> {
    return this.request<CanvasEntityWithId>(
      "POST",
      `/courses/${encodeURIComponent(lmsCourseId)}/external_tools`,
      payload
    );
  }

  createModule(
    lmsCourseId: string,
    moduleParams: { name: string; position?: number | null }
  ): Promise<CanvasEntityWithId> {
    return this.request<CanvasEntityWithId>(
      "POST",
      `/courses/${encodeURIComponent(lmsCourseId)}/modules`,
      { module: moduleParams }
    );
  }

  updateModule(
    lmsCourseId: string,
    moduleId: number,
    moduleParams: { published?: boolean; name?: string; position?: number | null }
  ): Promise<CanvasEntityWithId> {
    return this.request<CanvasEntityWithId>(
      "PUT",
      `/courses/${encodeURIComponent(lmsCourseId)}/modules/${moduleId}`,
      { module: moduleParams }
    );
  }

  createAssignmentGroup(
    lmsCourseId: string,
    params: { name: string }
  ): Promise<CanvasEntityWithId> {
    return this.request<CanvasEntityWithId>(
      "POST",
      `/courses/${encodeURIComponent(lmsCourseId)}/assignment_groups`,
      params
    );
  }

  createAssignment(
    lmsCourseId: string,
    assignmentParams: Record<string, unknown>
  ): Promise<CanvasEntityWithId> {
    return this.request<CanvasEntityWithId>(
      "POST",
      `/courses/${encodeURIComponent(lmsCourseId)}/assignments`,
      { assignment: assignmentParams }
    );
  }

  editAssignment(
    lmsCourseId: string,
    assignmentId: number,
    assignmentParams: Record<string, unknown>
  ): Promise<CanvasEntityWithId> {
    return this.request<CanvasEntityWithId>(
      "PUT",
      `/courses/${encodeURIComponent(lmsCourseId)}/assignments/${assignmentId}`,
      { assignment: assignmentParams }
    );
  }

  createModuleItem(
    lmsCourseId: string,
    moduleId: number,
    moduleItemParams: Record<string, unknown>
  ): Promise<CanvasEntityWithId> {
    return this.request<CanvasEntityWithId>(
      "POST",
      `/courses/${encodeURIComponent(lmsCourseId)}/modules/${moduleId}/items`,
      { module_item: moduleItemParams }
    );
  }

  updateModuleItem(
    lmsCourseId: string,
    moduleId: number,
    itemId: number,
    moduleItemParams: Record<string, unknown>
  ): Promise<CanvasEntityWithId> {
    return this.request<CanvasEntityWithId>(
      "PUT",
      `/courses/${encodeURIComponent(lmsCourseId)}/modules/${moduleId}/items/${itemId}`,
      { module_item: moduleItemParams }
    );
  }
}
