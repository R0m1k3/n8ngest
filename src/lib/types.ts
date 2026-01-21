export interface N8nWorkflow {
    id: string;
    name: string;
    active: boolean;
    nodes: any[];
    connections: any;
    createdAt: string;
    updatedAt: string;
    tags?: { id: string; name: string }[];
    settings?: any;
    staticData?: any;
}

export interface N8nExecution {
    id: string;
    finished: boolean;
    mode: string;
    retryOf?: string;
    retrySuccessId?: string;
    startedAt: string;
    stoppedAt: string;
    workflowId: string;
    data: {
        resultData: {
            runData: any;
        };
    };
}

export interface N8nConfig {
    baseUrl: string;
    apiKey: string;
}
