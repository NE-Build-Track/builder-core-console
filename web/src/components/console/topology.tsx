/**
 * How a paid job moves through the stack, drawn from live state: engine → signer (sign payment),
 * signer → Batteries (Kafka outbox), Batteries → engine (reconcile), engine → orchestrators.
 * Packets are SVG <animateMotion>: no script, and hidden when motion is reduced (globals.css).
 * A path only carries packets while both of its ends are healthy; a stale orchestrator gets none.
 */
import type { State, Topology } from "@/domain/views";

const ROWS = [42, 96, 150, 204, 258] as const;

function Packet({ path, kind, duration, delay }: { readonly path: string; readonly kind: string; readonly duration: number; readonly delay: number }) {
  return (
    // Starts off-canvas and with a negative begin, so every packet is already mid-path on first paint.
    <circle r="4" cx="-20" cy="-20" className={`pkt ${kind}`}>
      <animateMotion dur={`${duration}s`} begin={`-${delay}s`} repeatCount="indefinite" rotate="auto">
        <mpath href={`#${path}`} />
      </animateMotion>
    </circle>
  );
}

const flowing = (...states: State[]) => states.every((state) => state === "ok" || state === "warn");

export function TopologyDiagram({ topology }: { readonly topology: Topology }) {
  const shown = topology.orchestrators.slice(0, ROWS.length);
  const hidden = topology.orchestrators.length - shown.length;
  const { engine, signer, batteries } = topology;
  return (
    <svg className="topology" viewBox="0 0 780 300" role="img" aria-labelledby="topo-t topo-d">
      <title id="topo-t">How a paid job moves through the stack</title>
      <desc id="topo-d">
        The engine asks the signer to sign a payment and sends the job with the signed ticket to an orchestrator. The signer delivers an accounting
        event to Batteries through its Kafka outbox, and the engine reconciles its costs against Batteries. Engine: {engine.detail}. Signer:{" "}
        {signer.detail}. Batteries: {batteries.detail}. {topology.orchestrators.length} orchestrators discovered,{" "}
        {topology.orchestrators.filter((o) => o.stale).length} stale.
      </desc>
      <path id="e-sign" className="edge" d="M190 135 C 250 135, 240 60, 300 60" />
      <path className="flow" d="M190 135 C 250 135, 240 60, 300 60" />
      <path id="e-kafka" className="edge" d="M375 90 L375 210" />
      <path className="flow" d="M375 90 L375 210" />
      <path id="e-recon" className="edge" d="M300 240 C 240 240, 250 165, 190 165" strokeDasharray="4 5" />
      <path className="flow slow" d="M300 240 C 240 240, 250 165, 190 165" />
      {shown.map((_, index) => (
        <path key={index} id={`e-o${index}`} className="edge" d={`M190 150 C 420 150, 500 ${ROWS[index]}, 629 ${ROWS[index]}`} />
      ))}
      <text className="elabel" x="186" y="106" textAnchor="end">
        sign payment
      </text>
      <text className="elabel" x="384" y="122">
        Kafka outbox
      </text>
      <text className="elabel" x="200" y="214">
        reconcile
      </text>
      <text className="elabel" x="462" y="30">
        job + signed ticket
      </text>
      <g className={engine.state === "ok" ? "node hot" : "node"}>
        <rect x="40" y="118" width="150" height="64" rx="14" />
        <text x="58" y="146">
          Engine
        </text>
        <text className="sub" x="58" y="165">
          {engine.detail}
        </text>
      </g>
      <g className="node">
        <rect x="300" y="30" width="150" height="60" rx="14" />
        <text x="318" y="56">
          Signer
        </text>
        <text className="sub" x="318" y="74">
          {signer.detail}
        </text>
      </g>
      <g className="node">
        <rect x="300" y="210" width="150" height="60" rx="14" />
        <text x="318" y="236">
          Batteries
        </text>
        <text className="sub" x="318" y="254">
          {batteries.detail}
        </text>
      </g>
      <text className="elabel" x="628" y="18">
        Orchestrators
      </text>
      {shown.length === 0 ? (
        <text className="elabel" x="628" y="154">
          none discovered
        </text>
      ) : null}
      {shown.map((orchestrator, index) => (
        <g key={orchestrator.label} className={orchestrator.stale ? "orch stale" : "orch"}>
          <circle className="o" cx="640" cy={ROWS[index]} r="9" />
          <text x="658" y={(ROWS[index] ?? 0) + 4}>
            {orchestrator.label.length > 16 ? `${orchestrator.label.slice(0, 15)}…` : orchestrator.label}
          </text>
        </g>
      ))}
      {hidden > 0 ? (
        <text className="elabel" x="658" y="290">
          +{hidden} more
        </text>
      ) : null}
      <g>
        {flowing(engine.state, signer.state) ? (
          <>
            <Packet path="e-sign" kind="v" duration={3.1} delay={0} />
            <Packet path="e-sign" kind="v" duration={3.1} delay={1.55} />
          </>
        ) : null}
        {flowing(signer.state, batteries.state) ? (
          <>
            <Packet path="e-kafka" kind="" duration={3.6} delay={0.3} />
            <Packet path="e-kafka" kind="" duration={3.6} delay={2.1} />
          </>
        ) : null}
        {flowing(batteries.state, engine.state) ? <Packet path="e-recon" kind="m" duration={8} delay={1} /> : null}
        {flowing(engine.state)
          ? shown.map((orchestrator, index) =>
              orchestrator.stale ? null : <Packet key={orchestrator.label} path={`e-o${index}`} kind="ok" duration={5.5 - index * 0.4} delay={index * 1.1} />,
            )
          : null}
      </g>
    </svg>
  );
}
