import { ErghiClient } from '../client';
import { Workspace, CreateWorkspaceRequest } from '../types';

/**
 * Workspace resource
 */
export class WorkspaceResource {
  constructor(private client: ErghiClient) {}

  /**
   * Get workspace by ID
   */
  async get(workspaceId: string): Promise<Workspace> {
    const response = await this.client.getHttpClient().get<Workspace>(
      `/api/workspaces/${workspaceId}`
    );
    return response.data;
  }

  /**
   * List user's workspaces
   */
  async list(): Promise<Workspace[]> {
    const response = await this.client.getHttpClient().get<Workspace[]>('/api/workspaces');
    return response.data;
  }

  /**
   * Create a new workspace
   */
  async create(data: CreateWorkspaceRequest): Promise<Workspace> {
    const response = await this.client.getHttpClient().post<Workspace>('/api/workspaces', data);
    
    // Set as current workspace
    this.client.setWorkspaceId(response.data.id);
    
    return response.data;
  }

  /**
   * Update workspace
   */
  async update(workspaceId: string, data: Partial<CreateWorkspaceRequest>): Promise<Workspace> {
    const response = await this.client.getHttpClient().put<Workspace>(
      `/api/workspaces/${workspaceId}`,
      data
    );
    return response.data;
  }

  /**
   * Delete workspace
   */
  async delete(workspaceId: string): Promise<void> {
    await this.client.getHttpClient().delete(`/api/workspaces/${workspaceId}`);
  }

  /**
   * Switch current workspace context
   */
  switchWorkspace(workspaceId: string): void {
    this.client.setWorkspaceId(workspaceId);
  }
}
