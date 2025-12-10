/**
 * src/runtime/qec/TopologicalLayout.ts
 * 
 * Runtime support for defining and managing topological code layouts.
 * This module handles the mapping of logical qubits to physical qubit patches
 * on a 2D grid, supporting various QEC codes like Surface and Color codes.
 */

export enum CodeType {
    SURFACE_CODE = 'SURFACE_CODE',
    ROTATED_SURFACE_CODE = 'ROTATED_SURFACE_CODE',
    COLOR_CODE = 'COLOR_CODE',
    TORIC_CODE = 'TORIC_CODE'
}

export interface Coordinate {
    x: number;
    y: number;
    z?: number; // Optional layer index for 3D architectures or time-slices
}

export interface PhysicalQubit {
    id: string;
    coord: Coordinate;
    role: 'DATA' | 'ANCILLA_X' | 'ANCILLA_Z' | 'UNUSED';
    isActive: boolean;
    assignedPatchId?: string;
}

export interface LogicalPatch {
    id: string;
    label: string;
    topLeft: Coordinate;
    bottomRight: Coordinate; // Exclusive boundary
    codeType: CodeType;
    distance: number; // Code distance (d)
    physicalQubitIds: string[];
    orientation: 'HORIZONTAL' | 'VERTICAL'; // Relevant for lattice surgery
}

export interface LayoutConfig {
    width: number;
    height: number;
    defaultCodeType?: CodeType;
}

export class TopologicalLayout {
    private width: number;
    private height: number;
    private physicalQubits: Map<string, PhysicalQubit>;
    private logicalPatches: Map<string, LogicalPatch>;
    private defaultCodeType: CodeType;

    constructor(config: LayoutConfig) {
        this.width = config.width;
        this.height = config.height;
        this.defaultCodeType = config.defaultCodeType || CodeType.SURFACE_CODE;
        this.physicalQubits = new Map();
        this.logicalPatches = new Map();
        
        this.initializePhysicalGrid();
    }

    /**
     * Initializes the underlying physical qubit grid.
     * Assumes a rectangular lattice connectivity.
     */
    private initializePhysicalGrid(): void {
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const id = this.generateQubitId(x, y);
                
                // Determine role based on standard checkerboard pattern for Surface Code
                // (x + y) even -> Data, (x + y) odd -> Ancilla (simplified)
                // In a real hardware map, this would be loaded from a calibration file.
                let role: PhysicalQubit['role'] = 'UNUSED';
                if ((x + y) % 2 === 0) {
                    role = 'DATA';
                } else {
                    // Alternating X and Z ancillas
                    role = (x % 2 === 0) ? 'ANCILLA_X' : 'ANCILLA_Z';
                }

                this.physicalQubits.set(id, {
                    id,
                    coord: { x, y },
                    role,
                    isActive: false
                });
            }
        }
    }

    private generateQubitId(x: number, y: number): string {
        return `q_${x}_${y}`;
    }

    /**
     * Allocates a region of the physical grid to a new logical qubit patch.
     * 
     * @param id Unique identifier for the logical qubit
     * @param label Human-readable label (e.g., "q0")
     * @param topLeft Top-left coordinate of the patch
     * @param distance Code distance (d). Determines the size of the patch.
     * @param codeType The type of topological code to use.
     */
    public allocateLogicalPatch(
        id: string, 
        label: string, 
        topLeft: Coordinate, 
        distance: number, 
        codeType: CodeType = this.defaultCodeType
    ): LogicalPatch {
        if (this.logicalPatches.has(id)) {
            throw new Error(`Logical patch with ID '${id}' already exists.`);
        }

        // Calculate patch dimensions based on code distance and type
        // For standard surface code, a distance 'd' patch typically requires
        // (2d-1) x (2d-1) physical qubits roughly.
        let patchWidth = 0;
        let patchHeight = 0;

        switch (codeType) {
            case CodeType.SURFACE_CODE:
            case CodeType.ROTATED_SURFACE_CODE:
                patchWidth = 2 * distance - 1;
                patchHeight = 2 * distance - 1;
                break;
            case CodeType.COLOR_CODE:
                // Simplified estimation for color codes
                patchWidth = 3 * distance; 
                patchHeight = 3 * distance; 
                break;
            default:
                patchWidth = 2 * distance;
                patchHeight = 2 * distance;
        }

        const bottomRight: Coordinate = {
            x: topLeft.x + patchWidth,
            y: topLeft.y + patchHeight
        };

        // Boundary Check
        if (bottomRight.x > this.width || bottomRight.y > this.height) {
            throw new Error(`Allocation failed: Patch '${label}' exceeds grid boundaries.`);
        }

        // Overlap Check
        for (const existingPatch of this.logicalPatches.values()) {
            if (this.checkOverlap(topLeft, bottomRight, existingPatch.topLeft, existingPatch.bottomRight)) {
                throw new Error(`Allocation failed: Patch '${label}' overlaps with existing patch '${existingPatch.label}'.`);
            }
        }

        // Reserve Physical Qubits
        const patchQubitIds: string[] = [];
        for (let y = topLeft.y; y < bottomRight.y; y++) {
            for (let x = topLeft.x; x < bottomRight.x; x++) {
                const qId = this.generateQubitId(x, y);
                const qubit = this.physicalQubits.get(qId);
                
                if (qubit) {
                    if (qubit.isActive) {
                        // This should be caught by overlap check, but double check for safety
                        throw new Error(`Physical qubit ${qId} is already active.`);
                    }
                    qubit.isActive = true;
                    qubit.assignedPatchId = id;
                    patchQubitIds.push(qId);
                }
            }
        }

        const newPatch: LogicalPatch = {
            id,
            label,
            topLeft,
            bottomRight,
            codeType,
            distance,
            physicalQubitIds: patchQubitIds,
            orientation: 'HORIZONTAL' // Default
        };

        this.logicalPatches.set(id, newPatch);
        return newPatch;
    }

    /**
     * Deallocates a logical patch, freeing up the physical qubits.
     */
    public freeLogicalPatch(id: string): void {
        const patch = this.logicalPatches.get(id);
        if (!patch) return;

        for (const qId of patch.physicalQubitIds) {
            const qubit = this.physicalQubits.get(qId);
            if (qubit) {
                qubit.isActive = false;
                qubit.assignedPatchId = undefined;
            }
        }

        this.logicalPatches.delete(id);
    }

    /**
     * Checks if two rectangular regions overlap.
     */
    private checkOverlap(tl1: Coordinate, br1: Coordinate, tl2: Coordinate, br2: Coordinate): boolean {
        // If one rectangle is to the left of the other
        if (tl1.x >= br2.x || tl2.x >= br1.x) return false;
        // If one rectangle is above the other
        if (tl1.y >= br2.y || tl2.y >= br1.y) return false;
        return true;
    }

    public getPatch(id: string): LogicalPatch | undefined {
        return this.logicalPatches.get(id);
    }

    public getAllPatches(): LogicalPatch[] {
        return Array.from(this.logicalPatches.values());
    }

    public getPhysicalQubit(x: number, y: number): PhysicalQubit | undefined {
        return this.physicalQubits.get(this.generateQubitId(x, y));
    }

    /**
     * Calculates the Manhattan distance between the centers of two logical patches.
     * Useful for estimating routing costs or lattice surgery overhead.
     */
    public getManhattanDistance(patchId1: string, patchId2: string): number {
        const p1 = this.logicalPatches.get(patchId1);
        const p2 = this.logicalPatches.get(patchId2);

        if (!p1 || !p2) {
            throw new Error("One or both patch IDs not found.");
        }

        const center1 = {
            x: (p1.topLeft.x + p1.bottomRight.x) / 2,
            y: (p1.topLeft.y + p1.bottomRight.y) / 2
        };

        const center2 = {
            x: (p2.topLeft.x + p2.bottomRight.x) / 2,
            y: (p2.topLeft.y + p2.bottomRight.y) / 2
        };

        return Math.abs(center1.x - center2.x) + Math.abs(center1.y - center2.y);
    }

    /**
     * Finds a free region of specific dimensions using a simple first-fit strategy.
     * Returns the top-left coordinate if found, null otherwise.
     */
    public findFreeRegion(width: number, height: number): Coordinate | null {
        // Naive scan
        for (let y = 0; y <= this.height - height; y++) {
            for (let x = 0; x <= this.width - width; x++) {
                const tl = { x, y };
                const br = { x: x + width, y: y + height };
                
                let collision = false;
                for (const patch of this.logicalPatches.values()) {
                    if (this.checkOverlap(tl, br, patch.topLeft, patch.bottomRight)) {
                        collision = true;
                        break;
                    }
                }

                if (!collision) {
                    return tl;
                }
            }
        }
        return null;
    }

    /**
     * Generates an ASCII representation of the current layout for debugging.
     */
    public debugRender(): string {
        const grid: string[][] = [];
        for (let y = 0; y < this.height; y++) {
            const row: string[] = [];
            for (let x = 0; x < this.width; x++) {
                const q = this.getPhysicalQubit(x, y);
                if (!q) {
                    row.push(' ');
                    continue;
                }
                if (q.isActive && q.assignedPatchId) {
                    const patch = this.logicalPatches.get(q.assignedPatchId);
                    // Use the first letter of the label, or '#' if unknown
                    row.push(patch ? patch.label.charAt(0) : '#');
                } else {
                    row.push('.');
                }
            }
            grid.push(row);
        }
        return grid.map(row => row.join('')).join('\n');
    }
}