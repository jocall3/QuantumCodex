import {
    BraketClient,
    CreateQuantumTaskCommand,
    GetQuantumTaskCommand,
    SearchDevicesCommand
} from "@aws-sdk/client-braket";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { fromIni } from "@aws-sdk/credential-providers";

/**
 * A QCIL provider implementation for Amazon Braket.
 * This class handles authentication, job formatting, and API communication
 * specific to the AWS Braket quantum computing service.
 */
export class AWSBraketProvider {
    /**
     * @type {BraketClient | null}
     * @private
     */
    _braketClient = null;

    /**
     * @type {S3Client | null}
     * @private
     */
    _s3Client = null;

    /**
     * @type {object | null}
     * @private
     */
    _config = null;

    /**
     * Initializes the AWS Braket provider.
     * @param {object} config - The configuration object.
     * @param {string} config.region - The AWS region to use (e.g., 'us-east-1').
     * @param {object} [config.credentials] - Optional AWS credentials. If not provided, the SDK will use the default credential chain.
     * @param {string} [config.credentials.accessKeyId] - AWS Access Key ID.
     * @param {string} [config.credentials.secretAccessKey] - AWS Secret Access Key.
     * @param {string} [config.credentials.sessionToken] - AWS Session Token (for temporary credentials).
     * @param {string} [config.profile] - The AWS profile to use from the credentials file.
     */
    constructor(config = {}) {
        if (!config.region) {
            throw new Error("AWS region must be specified in the configuration.");
        }
        this._config = config;
    }

    /**
     * Authenticates and initializes the AWS clients.
     * This method must be called before any other operations.
     * @returns {Promise<void>}
     */
    async connect() {
        const clientConfig = {
            region: this._config.region,
        };

        if (this._config.credentials) {
            clientConfig.credentials = this._config.credentials;
        } else if (this._config.profile) {
            clientConfig.credentials = fromIni({ profile: this._config.profile });
        }
        // If neither is provided, the SDK will use its default credential provider chain
        // (e.g., environment variables, EC2 instance metadata).

        try {
            this._braketClient = new BraketClient(clientConfig);
            this._s3Client = new S3Client(clientConfig);
            // A simple way to test connectivity and authentication is to list devices.
            await this.listDevices({ maxResults: 1 });
        } catch (error) {
            this._braketClient = null;
            this._s3Client = null;
            console.error("Failed to connect to AWS Braket:", error);
            throw new Error(`AWS connection failed: ${error.message}`);
        }
    }

    /**
     * Checks if the provider is connected and ready to use.
     * @returns {boolean}
     */
    isConnected() {
        return !!this._braketClient && !!this._s3Client;
    }

    /**
     * Lists available quantum devices on Amazon Braket.
     * @param {object} [filters={}] - Optional filters for the device search.
     * @param {number} [filters.maxResults] - The maximum number of devices to return.
     * @returns {Promise<Array<object>>} A list of device objects from the Braket API.
     */
    async listDevices(filters = {}) {
        if (!this.isConnected()) {
            throw new Error("Provider is not connected. Call connect() first.");
        }

        const command = new SearchDevicesCommand({
            filters: [
                // Example filter, can be extended by the caller
                // { name: "type", values: ["QPU"] }
            ],
            maxResults: filters.maxResults || 100,
        });

        try {
            const response = await this._braketClient.send(command);
            return response.devices;
        } catch (error) {
            console.error("Error listing Braket devices:", error);
            throw error;
        }
    }

    /**
     * Submits a quantum circuit to be executed on a Braket device.
     * @param {object} jobRequest - The job request details.
     * @param {string} jobRequest.circuit - The quantum circuit as an OpenQASM 3.0 string.
     * @param {string} jobRequest.deviceArn - The ARN of the target Braket device.
     * @param {string} jobRequest.s3OutputPrefix - The S3 bucket and prefix for storing results (e.g., 's3://my-bucket/my-results').
     * @param {number} jobRequest.shots - The number of times to execute the circuit.
     * @returns {Promise<string>} The quantum task ARN, which serves as the job ID.
     */
    async run(jobRequest) {
        if (!this.isConnected()) {
            throw new Error("Provider is not connected. Call connect() first.");
        }

        const { circuit, deviceArn, s3OutputPrefix, shots } = jobRequest;

        if (!circuit || !deviceArn || !s3OutputPrefix || !shots) {
            throw new Error("Missing required parameters: circuit, deviceArn, s3OutputPrefix, and shots.");
        }

        const [s3Bucket, ...s3PrefixParts] = s3OutputPrefix.replace('s3://', '').split('/');
        const s3KeyPrefix = s3PrefixParts.join('/');

        const command = new CreateQuantumTaskCommand({
            action: JSON.stringify({
                braketSchemaHeader: { name: "braket.ir.openqasm.program", version: "1" },
                source: circuit,
            }),
            deviceArn: deviceArn,
            outputS3Bucket: s3Bucket,
            outputS3KeyPrefix: s3KeyPrefix,
            shots: shots,
        });

        try {
            const response = await this._braketClient.send(command);
            return response.quantumTaskArn;
        } catch (error) {
            console.error("Error creating Braket quantum task:", error);
            throw error;
        }
    }

    /**
     * Retrieves the status of a quantum task.
     * @param {string} jobId - The quantum task ARN.
     * @returns {Promise<object>} An object containing the job status and other metadata.
     */
    async getJobStatus(jobId) {
        if (!this.isConnected()) {
            throw new Error("Provider is not connected. Call connect() first.");
        }

        const command = new GetQuantumTaskCommand({
            quantumTaskArn: jobId,
        });

        try {
            const response = await this._braketClient.send(command);
            return {
                id: response.quantumTaskArn,
                status: response.status,
                device: response.deviceArn,
                createdAt: response.createdAt,
                endedAt: response.endedAt,
                failureReason: response.failureReason,
                outputS3: `s3://${response.outputS3Bucket}/${response.outputS3KeyPrefix}`
            };
        } catch (error) {
            console.error(`Error getting status for job ${jobId}:`, error);
            throw error;
        }
    }

    /**
     * Retrieves the result of a completed quantum task from S3.
     * @param {string} jobId - The quantum task ARN.
     * @returns {Promise<object>} The parsed result JSON from S3.
     */
    async getJobResult(jobId) {
        if (!this.isConnected()) {
            throw new Error("Provider is not connected. Call connect() first.");
        }

        const status = await this.getJobStatus(jobId);

        if (status.status !== 'COMPLETED') {
            throw new Error(`Job ${jobId} is not complete. Current status: ${status.status}`);
        }

        const s3Path = status.outputS3;
        const [bucket, ...keyParts] = s3Path.replace('s3://', '').split('/');
        const key = `${keyParts.join('/')}/results.json`;

        const command = new GetObjectCommand({
            Bucket: bucket,
            Key: key,
        });

        try {
            const response = await this._s3Client.send(command);
            const bodyStream = response.Body;
            if (!bodyStream) {
                throw new Error("S3 response body is empty.");
            }
            const bodyString = await this._streamToString(bodyStream);
            return JSON.parse(bodyString);
        } catch (error) {
            console.error(`Error retrieving result for job ${jobId} from S3:`, error);
            throw error;
        }
    }

    /**
     * Helper function to convert a readable stream to a string.
     * @param {ReadableStream} stream - The stream to convert.
     * @returns {Promise<string>}
     * @private
     */
    _streamToString(stream) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            stream.on('data', (chunk) => chunks.push(chunk));
            stream.on('error', reject);
            stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        });
    }
}