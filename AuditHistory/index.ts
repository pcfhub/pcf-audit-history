import * as React from 'react';
import { IInputs, IOutputs } from './generated/ManifestTypes';
import { Probe } from './probe';

/** 0.0.2 — THE SECOND PROBE. index.live.ts is the control; this renders probe.tsx. */
export class AuditHistory implements ComponentFramework.ReactControl<IInputs, IOutputs> {
    private context!: ComponentFramework.Context<IInputs>;
    private passes = 0;

    public init(context: ComponentFramework.Context<IInputs>): void {
        this.context = context;
    }

    public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
        this.context = context;
        this.passes += 1;
        return React.createElement(Probe, { context: () => this.context, passes: this.passes });
    }

    public getOutputs(): IOutputs {
        return {};
    }

    public destroy(): void {
        // Nothing to release.
    }
}
