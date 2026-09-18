declare module "gltf-validator" {
    export interface ValidationIssue {
        readonly code: string;
        readonly message: string;
        readonly severity: 0 | 1 | 2 | 3;
        readonly pointer?: string;
        readonly offset?: number;
    }

    export interface ValidationReport {
        readonly issues: {
            readonly numErrors: number;
            readonly numWarnings: number;
            readonly numInfos: number;
            readonly numHints: number;
            readonly messages: readonly ValidationIssue[];
            readonly truncated: boolean;
        };
    }

    export interface ValidationOptions {
        readonly maxIssues?: number;
        readonly ignoredIssues?: readonly string[];
        readonly externalResourceFunction?: (uri: string) => Promise<Uint8Array>;
    }

    export function validateString(json: string, options?: ValidationOptions): Promise<ValidationReport>;
}
