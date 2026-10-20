/** The scrolling strip of the newest signed tickets. Pure CSS: it pauses on hover and focus, and is a plain scroller when motion is reduced. */
import type { TickerItem } from "@/domain/views";

import { Ago, Glyph } from "./values";

function shortAddress(address: string): string {
  return address.startsWith("0x") && address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

function Items({ items }: { readonly items: readonly TickerItem[] }) {
  return items.map((item) => (
    <li key={item.id}>
      <Glyph state="ok" />
      <span className="fee">{item.feeUsd} USD</span>
      <span className="app mono">{item.app}</span>
      <span className="mono muted" title={item.orchestrator}>
        {shortAddress(item.orchestrator)}
      </span>
      <Ago iso={item.at} />
    </li>
  ));
}

export function Ticker({ items, className }: { readonly items: readonly TickerItem[]; readonly className?: string }) {
  return (
    <div className={["ticker", className].filter(Boolean).join(" ")} role="region" aria-label="Recent signed tickets" tabIndex={0}>
      <span className="ticker-label">
        <Glyph state="ok" live />
        Signed tickets
      </span>
      <div className="ticker-view">
        <div className="ticker-track">
          <ul role="list">
            <Items items={items} />
          </ul>
          {/* A second copy makes the marquee loop seamlessly; assistive tech reads the list once. */}
          <ul role="list" aria-hidden="true">
            <Items items={items} />
          </ul>
        </div>
      </div>
    </div>
  );
}

