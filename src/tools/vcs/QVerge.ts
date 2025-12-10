import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';

/**
 * Type definitions for Q-Verge Quantum VCS
 */
type Hash = string;
type Probability = number; // 0.0 to 1.0 representing amplitude squared

interface BlobObject {
    type: 'blob';
    content: Buffer;
}

interface TreeObject {
    type: 'tree';
    entries: Record<string, TreeEntry>;
}

interface TreeEntry {
    mode: number;
    hash: Hash;
    type: 'blob' | 'tree' | 'quantum_superposition';
}

interface QuantumSuperposition {
    type: 'quantum_superposition';
    variants: Array<{
        hash: Hash;
        probability: Probability;
        origin: string; // Branch or Commit ID origin
    }>;
}

interface CommitObject {
    type: 'commit';
    tree: Hash;
    parents: Hash[];
    author: string;
    timestamp: number;
    message: string;
    metadata?: Record<string, any>;
}

interface EntanglementLink {
    sourcePath: string;
    targetPath: string; // Can be across branches
    strength: number; // 0 to 1
}

export interface QVergeConfig {
    user: {
        name: string;
        email: string;
    };
    quantum: {
        defaultCollapseStrategy: 'highest_probability' | 'random' | 'observer_choice';
        entanglementEnabled: boolean;
    };
}

/**
 * QVerge: Non-classical Version Control System
 * Handles quantum state branching, superposition merging, and entanglement.
 */
export class QVerge extends EventEmitter {
    private rootDir: string;
    private vcsDir: string;
    private objectsDir: string;
    private refsDir: string;
    private config: QVergeConfig;

    constructor(rootDir: string) {
        super();
        this.rootDir = path.resolve(rootDir);
        this.vcsDir = path.join(this.rootDir, '.qverge');
        this.objectsDir = path.join(this.vcsDir, 'objects');
        this.refsDir = path.join(this.vcsDir, 'refs');
        
        // Default config
        this.config = {
            user: { name: 'Unknown', email: 'unknown@u-lang.org' },
            quantum: {
                defaultCollapseStrategy: 'highest_probability',
                entanglementEnabled: true
            }
        };
    }

    /**
     * Initialize the Q-Verge repository structure.
     */
    public init(): void {
        if (fs.existsSync(this.vcsDir)) {
            throw new Error('Q-Verge repository already initialized.');
        }

        fs.mkdirSync(this.vcsDir, { recursive: true });
        fs.mkdirSync(this.objectsDir, { recursive: true });
        fs.mkdirSync(path.join(this.refsDir, 'heads'), { recursive: true });
        fs.mkdirSync(path.join(this.refsDir, 'tags'), { recursive: true });

        // Create initial HEAD pointing to master timeline
        fs.writeFileSync(path.join(this.vcsDir, 'HEAD'), 'ref: refs/heads/master');
        
        // Create config file
        fs.writeFileSync(path.join(this.vcsDir, 'config.json'), JSON.stringify(this.config, null, 2));

        this.emit('initialized', { path: this.rootDir });
    }

    /**
     * Stage and commit the current state of the working directory.
     */
    public commit(message: string): Hash {
        this.loadConfig();
        const indexTree = this.buildTreeFromWorkingDir(this.rootDir);
        const treeHash = this.storeObject(indexTree);
        
        const parentHash = this.resolveHead();
        const parents = parentHash ? [parentHash] : [];

        const commit: CommitObject = {
            type: 'commit',
            tree: treeHash,
            parents: parents,
            author: `${this.config.user.name} <${this.config.user.email}>`,
            timestamp: Date.now(),
            message: message
        };

        const commitHash = this.storeObject(commit);
        this.updateHead(commitHash);
        
        this.emit('commit', { hash: commitHash, message });
        return commitHash;
    }

    /**
     * Create a new timeline (branch).
     */
    public branch(name: string): void {
        const headHash = this.resolveHead();
        if (!headHash) throw new Error('No commits to branch from.');
        
        const branchPath = path.join(this.refsDir, 'heads', name);
        if (fs.existsSync(branchPath)) throw new Error(`Timeline '${name}' already exists.`);
        
        fs.writeFileSync(branchPath, headHash);
    }

    /**
     * Switch to a different timeline or commit.
     * If the target state contains superpositions, they are collapsed based on strategy.
     */
    public checkout(refName: string): void {
        const targetHash = this.resolveRef(refName);
        if (!targetHash) throw new Error(`Reference '${refName}' not found.`);

        const commit = this.readObject<CommitObject>(targetHash);
        if (commit.type !== 'commit') throw new Error('Target is not a commit.');

        // Update HEAD
        if (refName.startsWith('refs/')) {
            fs.writeFileSync(path.join(this.vcsDir, 'HEAD'), `ref: ${refName}`);
        } else if (this.isBranch(refName)) {
            fs.writeFileSync(path.join(this.vcsDir, 'HEAD'), `ref: refs/heads/${refName}`);
        } else {
            // Detached HEAD
            fs.writeFileSync(path.join(this.vcsDir, 'HEAD'), targetHash);
        }

        // Restore files
        this.restoreTree(commit.tree, this.rootDir);
        this.emit('checkout', { ref: refName, hash: targetHash });
    }

    /**
     * Create a Quantum Superposition of the current branch and a target branch.
     * Unlike a merge, conflicts are stored as probabilistic states.
     */
    public superpose(targetBranch: string, probability: number = 0.5): Hash {
        const currentHeadHash = this.resolveHead();
        const targetHash = this.resolveRef(targetBranch);

        if (!currentHeadHash || !targetHash) throw new Error('Invalid branches for superposition.');

        const currentCommit = this.readObject<CommitObject>(currentHeadHash);
        const targetCommit = this.readObject<CommitObject>(targetHash);

        const currentTree = this.readObject<TreeObject>(currentCommit.tree);
        const targetTree = this.readObject<TreeObject>(targetCommit.tree);

        // Create a new tree that contains superpositions
        const superposedTree = this.createSuperposedTree(currentTree, targetTree, probability);
        const treeHash = this.storeObject(superposedTree);

        const commit: CommitObject = {
            type: 'commit',
            tree: treeHash,
            parents: [currentHeadHash, targetHash],
            author: this.config.user.name,
            timestamp: Date.now(),
            message: `Quantum Superposition of ${targetBranch} into HEAD (p=${probability})`,
            metadata: {
                isQuantumState: true,
                superpositionProbability: probability
            }
        };

        const commitHash = this.storeObject(commit);
        this.updateHead(commitHash);
        
        // We do not automatically checkout/restore, as the workspace is now in a "mixed" state
        // The user must explicitly collapse or observe to see files.
        
        this.emit('superpose', { hash: commitHash, target: targetBranch });
        return commitHash;
    }

    /**
     * Collapse a specific file or the entire repository from a superposition state 
     * into a classical state.
     */
    public collapse(pathSpec: string = '.', strategy?: 'highest_probability' | 'random'): void {
        const headHash = this.resolveHead();
        if (!headHash) return;

        const commit = this.readObject<CommitObject>(headHash);
        const tree = this.readObject<TreeObject>(commit.tree);

        // Recursively collapse the tree and write to disk
        this.collapseTreeToDisk(tree, this.rootDir, strategy || this.config.quantum.defaultCollapseStrategy);
        
        // Note: This changes the working directory but does not create a new commit automatically.
        // The user must commit the collapsed state to "finalize" the observation.
    }

    /**
     * Entangle two files. Changes to one will propagate to the other upon commit,
     * regardless of directory structure.
     */
    public entangle(fileA: string, fileB: string): void {
        const entanglementDbPath = path.join(this.vcsDir, 'entanglements.json');
        let entanglements: EntanglementLink[] = [];
        
        if (fs.existsSync(entanglementDbPath)) {
            entanglements = JSON.parse(fs.readFileSync(entanglementDbPath, 'utf-8'));
        }

        entanglements.push({
            sourcePath: fileA,
            targetPath: fileB,
            strength: 1.0
        });

        fs.writeFileSync(entanglementDbPath, JSON.stringify(entanglements, null, 2));
        this.emit('entangle', { fileA, fileB });
    }

    // ==========================================
    // Internal Logic & Helpers
    // ==========================================

    private loadConfig() {
        const configPath = path.join(this.vcsDir, 'config.json');
        if (fs.existsSync(configPath)) {
            this.config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        }
    }

    private hash(data: Buffer | string): Hash {
        return crypto.createHash('sha1').update(data).digest('hex');
    }

    private storeObject(obj: BlobObject | TreeObject | CommitObject | QuantumSuperposition): Hash {
        const content = JSON.stringify(obj);
        const oid = this.hash(content);
        const objectPath = path.join(this.objectsDir, oid.substring(0, 2), oid.substring(2));
        
        fs.mkdirSync(path.dirname(objectPath), { recursive: true });
        fs.writeFileSync(objectPath, content); // In production, this would be zlib compressed
        return oid;
    }

    private readObject<T>(oid: Hash): T {
        const objectPath = path.join(this.objectsDir, oid.substring(0, 2), oid.substring(2));
        if (!fs.existsSync(objectPath)) {
            throw new Error(`Object ${oid} not found.`);
        }
        const content = fs.readFileSync(objectPath, 'utf-8');
        return JSON.parse(content) as T;
    }

    private resolveHead(): Hash | null {
        const headPath = path.join(this.vcsDir, 'HEAD');
        if (!fs.existsSync(headPath)) return null;
        
        const content = fs.readFileSync(headPath, 'utf-8').trim();
        if (content.startsWith('ref: ')) {
            return this.resolveRef(content.substring(5));
        }
        return content;
    }

    private resolveRef(ref: string): Hash | null {
        let fullPath = ref;
        if (!ref.startsWith('refs/')) {
            // Try heads
            fullPath = path.join(this.refsDir, 'heads', ref);
            if (!fs.existsSync(fullPath)) {
                // Try tags
                fullPath = path.join(this.refsDir, 'tags', ref);
            }
        } else {
            fullPath = path.join(this.vcsDir, ref);
        }

        if (fs.existsSync(fullPath)) {
            return fs.readFileSync(fullPath, 'utf-8').trim();
        }
        return null;
    }

    private updateHead(hash: Hash): void {
        const headPath = path.join(this.vcsDir, 'HEAD');
        const content = fs.readFileSync(headPath, 'utf-8').trim();
        
        if (content.startsWith('ref: ')) {
            const refPath = path.join(this.vcsDir, content.substring(5));
            fs.writeFileSync(refPath, hash);
        } else {
            // Detached HEAD, just update HEAD
            fs.writeFileSync(headPath, hash);
        }
    }

    private isBranch(name: string): boolean {
        return fs.existsSync(path.join(this.refsDir, 'heads', name));
    }

    private buildTreeFromWorkingDir(dir: string): TreeObject {
        const entries: Record<string, TreeEntry> = {};
        const files = fs.readdirSync(dir);

        for (const file of files) {
            if (file === '.qverge' || file === '.git' || file === 'node_modules') continue;
            
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                const subtree = this.buildTreeFromWorkingDir(fullPath);
                const hash = this.storeObject(subtree);
                entries[file] = { mode: 0o040000, hash, type: 'tree' };
            } else {
                const content = fs.readFileSync(fullPath);
                const blob: BlobObject = { type: 'blob', content };
                const hash = this.storeObject(blob);
                entries[file] = { mode: 0o100644, hash, type: 'blob' };
            }
        }

        return { type: 'tree', entries };
    }

    private restoreTree(treeHash: Hash, targetDir: string): void {
        const tree = this.readObject<TreeObject>(treeHash);
        
        // Clean directory first (naive implementation)
        // In production, we would diff and only change necessary files
        
        for (const [name, entry] of Object.entries(tree.entries)) {
            const fullPath = path.join(targetDir, name);
            
            if (entry.type === 'tree') {
                fs.mkdirSync(fullPath, { recursive: true });
                this.restoreTree(entry.hash, fullPath);
            } else if (entry.type === 'blob') {
                const blob = this.readObject<BlobObject>(entry.hash);
                fs.writeFileSync(fullPath, Buffer.from(blob.content));
            } else if (entry.type === 'quantum_superposition') {
                // When restoring a superposition without explicit collapse,
                // we write a placeholder or the highest probability variant.
                const qObj = this.readObject<QuantumSuperposition>(entry.hash);
                const bestVariant = qObj.variants.reduce((prev, current) => 
                    (prev.probability > current.probability) ? prev : current
                );
                
                // Recursively resolve the variant (it could be a blob or tree)
                // For simplicity, assuming blob here or handling logic needed for tree variants
                if (this.isBlob(bestVariant.hash)) {
                    const blob = this.readObject<BlobObject>(bestVariant.hash);
                    fs.writeFileSync(fullPath, Buffer.from(blob.content));
                }
            }
        }
    }

    private createSuperposedTree(base: TreeObject, target: TreeObject, prob: number): TreeObject {
        const entries: Record<string, TreeEntry> = {};
        const allKeys = new Set([...Object.keys(base.entries), ...Object.keys(target.entries)]);

        for (const key of allKeys) {
            const baseEntry = base.entries[key];
            const targetEntry = target.entries[key];

            if (baseEntry && targetEntry && baseEntry.hash === targetEntry.hash) {
                // Identical, keep base
                entries[key] = baseEntry;
            } else if (baseEntry && targetEntry) {
                // Conflict -> Create Superposition
                const superposition: QuantumSuperposition = {
                    type: 'quantum_superposition',
                    variants: [
                        { hash: baseEntry.hash, probability: 1.0 - prob, origin: 'HEAD' },
                        { hash: targetEntry.hash, probability: prob, origin: 'MERGE_HEAD' }
                    ]
                };
                const hash = this.storeObject(superposition);
                entries[key] = { mode: baseEntry.mode, hash, type: 'quantum_superposition' };
            } else if (baseEntry) {
                // Exists only in base
                entries[key] = baseEntry;
            } else {
                // Exists only in target
                // In a superposition, existence itself can be probabilistic, 
                // but for file system sanity, we include it with a quantum marker or just include it.
                // Here we include it.
                entries[key] = targetEntry;
            }
        }

        return { type: 'tree', entries };
    }

    private collapseTreeToDisk(tree: TreeObject, currentPath: string, strategy: string): void {
        for (const [name, entry] of Object.entries(tree.entries)) {
            const fullPath = path.join(currentPath, name);

            if (entry.type === 'tree') {
                if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath);
                const subTree = this.readObject<TreeObject>(entry.hash);
                this.collapseTreeToDisk(subTree, fullPath, strategy);
            } else if (entry.type === 'blob') {
                const blob = this.readObject<BlobObject>(entry.hash);
                fs.writeFileSync(fullPath, Buffer.from(blob.content));
            } else if (entry.type === 'quantum_superposition') {
                const qObj = this.readObject<QuantumSuperposition>(entry.hash);
                let selectedHash: Hash;

                if (strategy === 'random') {
                    const rand = Math.random();
                    let cumulative = 0;
                    selectedHash = qObj.variants[0].hash; // Default
                    for (const v of qObj.variants) {
                        cumulative += v.probability;
                        if (rand <= cumulative) {
                            selectedHash = v.hash;
                            break;
                        }
                    }
                } else {
                    // Highest probability
                    const best = qObj.variants.reduce((p, c) => p.probability > c.probability ? p : c);
                    selectedHash = best.hash;
                }

                // Check if the selected hash is a blob or tree (superposition of directories is possible)
                // Assuming blob for file content superposition
                try {
                    const blob = this.readObject<BlobObject>(selectedHash);
                    fs.writeFileSync(fullPath, Buffer.from(blob.content));
                } catch {
                    // If it's a tree
                    if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath);
                    const subTree = this.readObject<TreeObject>(selectedHash);
                    this.collapseTreeToDisk(subTree, fullPath, strategy);
                }
            }
        }
    }

    private isBlob(hash: Hash): boolean {
        try {
            const obj = this.readObject<any>(hash);
            return obj.type === 'blob';
        } catch {
            return false;
        }
    }
}