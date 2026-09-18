import * as React from 'react';
import { IInputs, IOutputs } from './generated/ManifestTypes';
import { Probe } from './probe';

/**
 * 0.0.1 — THE PROBE BUILD. This entry point renders `probe.tsx` and nothing
 * else; it is replaced by the control in 0.1.0. See SPEC.md, *Measured — the
 * 0.0.1 probe*, for the questions it asks the form.
 */
export class AuditHistory implements ComponentFramework.ReactControl<IInputs, IOutputs> {
    private context!: ComponentFramework.Context<IInputs>;
    private passes = 0;

    public init(context: ComponentFramework.Context<IInputs>): void {
        this.context = context;
    }

    public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
        // Kept current on every pass and handed down as a getter, so the probe
        // never reads a snapshot the platform has since replaced.
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
