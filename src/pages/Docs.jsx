import React, { useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, ChevronLeft, ChevronRight, Hexagon } from "lucide-react";
import { BOTCHAIN, CONTRACTS } from "../lib/chain.js";
import { cn } from "../lib/utils.js";

const GITHUB_URL = "https://github.com/mrnetwork0001/Syntura";

function goto(page) {
  window.dispatchEvent(
    new CustomEvent("syntura:navigate", { detail: { page } })
  );
}

/* ── Content primitives ────────────────────────────────────────────────── */

function P({ children }) {
  return (
    <p className="mt-4 text-[15px] leading-relaxed text-slate-400">{children}</p>
  );
}

function Strong({ children }) {
  return <span className="font-semibold text-slate-200">{children}</span>;
}

function Code({ children }) {
  return (
    <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[13px] text-electric-soft">
      {children}
    </code>
  );
}

function H2({ children }) {
  return (
    <h2 className="mt-12 border-t border-white/[0.06] pt-10 text-2xl font-extrabold tracking-tight text-white">
      {children}
    </h2>
  );
}

function DocLink({ href, children }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-electric-soft transition-colors hover:text-white"
    >
      {children} <ArrowUpRight size={12} />
    </a>
  );
}

/** Key/value reference table in the style of the app's terminal panels. */
function KVTable({ rows }) {
  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-sm">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-white/[0.06]">
              <td className="w-56 py-3.5 pr-6 align-top text-slate-400">{k}</td>
              <td className="py-3.5 text-slate-200">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Bullets({ items }) {
  return (
    <ul className="mt-4 space-y-2.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-slate-400">
          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-electric" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function Mono({ children }) {
  return <span className="font-mono text-[13px]">{children}</span>;
}

const addr = (a) => (
  <DocLink href={`${BOTCHAIN.explorerUrl}/address/${a}`}>
    <Mono>{a.slice(0, 10)}…{a.slice(-6)}</Mono>
  </DocLink>
);

/* ── Sections ──────────────────────────────────────────────────────────── */

const SECTIONS = [
  {
    group: "Getting started",
    key: "welcome",
    title: "Welcome to Syntura",
    body: (
      <>
        <P>
          <Strong>
            Syntura is an AI-underwritten RWA invoice protocol on BOTChain
            Mainnet.
          </Strong>{" "}
          Suppliers tokenize unpaid B2B invoices as ERC-721 NFTs, a
          deterministic AI agent prices each invoice's risk and discount, the
          liquidity vault streams working capital to the supplier the moment
          the audit clears, and settlement executes an atomic 90/7/3 split -
          supplier, liquidity pool, protocol treasury.
        </P>
        <P>
          The AI is not a chat feature bolted onto a dApp. The sentry is the
          protocol's underwriter: only registry-verified agents can write risk
          scores onchain, every verdict carries a reproducible audit hash, and
          anyone can re-run the open-source model to check what was committed.
        </P>
        <Bullets
          items={[
            <>
              <Strong>Tokenize</Strong> - an invoice becomes a verifiable
              onchain claim on future cash flow.
            </>,
            <>
              <Strong>Underwrite</Strong> - a deterministic model prices it in
              milliseconds, not weeks.
            </>,
            <>
              <Strong>Stream &amp; settle</Strong> - real value moves on
              BOTChain, with every leg emitted as an indexed event.
            </>,
          ]}
        />
        <H2>Where everything lives</H2>
        <KVTable
          rows={[
            ["Network", <>BOT Chain Mainnet · chain ID <Mono>677</Mono> (<Mono>0x2a5</Mono>)</>],
            ["RPC", <Mono>{BOTCHAIN.rpcUrl}</Mono>],
            ["Explorer", <DocLink href={BOTCHAIN.explorerUrl}><Mono>scan.botchain.ai</Mono></DocLink>],
            ["SynturaInvoiceNFT", addr(CONTRACTS.invoiceNFT || "0xD8816ecf2D243f4B5328502ACAB83a9dF043A40a")],
            ["SynturaVault", addr(CONTRACTS.vault || "0x7199D8db46142B784ab4De225EADf91f4F10ca14")],
            ["SynturaSentryRegistry", addr(CONTRACTS.sentryRegistry || "0x19B0c0BB8A654b950739B84776A5951BA4ABf676")],
            ["GitHub", <DocLink href={GITHUB_URL}><Mono>mrnetwork0001/Syntura</Mono></DocLink>],
            ["License", "Apache-2.0, fully open source"],
          ]}
        />
      </>
    ),
  },
  {
    group: "Getting started",
    key: "how-it-works",
    title: "How it works",
    body: (
      <>
        <P>
          Every invoice moves through four onchain stages. Each stage is a
          single wallet-signed transaction, and each emits an indexed event
          that the in-app audit log renders as an explorer-linked timeline.
        </P>
        <KVTable
          rows={[
            [
              <Mono>1 · mintInvoice()</Mono>,
              <>The supplier mints the invoice as a <Strong>SYNV</Strong> NFT: debtor name, face value, due date and metadata go onchain; the token is minted to the supplier's wallet.</>,
            ],
            [
              <Mono>2 · underwriteInvoice()</Mono>,
              <>A registry-verified AI sentry writes the risk score (0-100), discount rate (bps) and the deterministic audit hash of its full reasoning. The same hash is anchored in the registry via <Code>commitRiskScore()</Code>.</>,
            ],
            [
              <Mono>3 · streamPayout()</Mono>,
              <>Permissionless trigger. The vault advances <Code>face × (9000 - discountBps) / 10000</Code> from pooled liquidity straight to the invoice's onchain supplier - once per invoice, bounded by available liquidity.</>,
            ],
            [
              <Mono>4 · settleInvoice()</Mono>,
              <>The debtor repays exact face value into the vault. The waterfall splits it 90% supplier / 7% pool / 3% treasury; the supplier leg is netted against the streamed advance, which returns pool principal.</>,
            ],
          ]}
        />
        <P>
          Liquidity providers sit underneath the whole cycle: they deposit
          native BOT into the vault, earn the 7% pool fee from every
          settlement pro-rata, and withdraw yield (or idle principal) at any
          time via pull-payments.
        </P>
      </>
    ),
  },
  {
    group: "Protocol",
    key: "invoice-nft",
    title: "Invoice NFTs",
    body: (
      <>
        <P>
          <Code>SynturaInvoiceNFT.sol</Code> is an ERC-721 collection
          (symbol <Strong>SYNV</Strong>) where each token is one tokenized
          invoice. The struct stored per token:
        </P>
        <KVTable
          rows={[
            [<Mono>supplier</Mono>, "The wallet that minted - receives streams and the settlement residual."],
            [<Mono>debtorName</Mono>, "The paying counterparty, stored as a public string."],
            [<Mono>faceValueUSD</Mono>, <>Face value at the protocol scale (<Code>1 USD = 1e12 wei</Code> - see Value scale).</>],
            [<Mono>dueDate</Mono>, "Unix timestamp of invoice maturity."],
            [<Mono>riskScore / discountRateBps</Mono>, "Written once by the verified sentry at underwriting."],
            [<Mono>isUnderwritten / isSettled</Mono>, "Lifecycle flags gating streaming and settlement."],
            [<Mono>tokenURI</Mono>, "JSON metadata: sector, supplier name, term days, fraud probability."],
          ]}
        />
        <H2>Access control</H2>
        <Bullets
          items={[
            <>Anyone can mint - a mint is a claim, not a judgment; it earns nothing until underwritten.</>,
            <><Code>underwriteInvoice</Code> requires <Code>isVerifiedSentry(msg.sender)</Code> via the registry (or the contract owner).</>,
            <><Code>settleInvoice</Code> on the NFT is <Strong>vault-only</Strong>: only the wired vault can flip <Code>isSettled</Code>, because the vault is the only actor that also reconciles advance accounting. There is deliberately no owner escape hatch.</>,
          ]}
        />
      </>
    ),
  },
  {
    group: "Protocol",
    key: "vault",
    title: "Vault & streaming",
    body: (
      <>
        <P>
          <Code>SynturaVault.sol</Code> is the protocol's money layer:
          liquidity pool, streaming escrow and settlement engine, denominated
          in native BOT. All value-moving functions are non-reentrant, and
          transfers out use pull-over-push wherever an actor can claim instead.
        </P>
        <KVTable
          rows={[
            [<Mono>depositLiquidity()</Mono>, "Payable. Adds principal to the pool; pending yield is checkpointed first (MasterChef-style accumulator)."],
            [<Mono>streamPayout(id)</Mono>, <>Advances <Code>face × (9000 - discountBps) / 10000</Code> to the supplier. Once per invoice; the AI-quoted discount is the pool's holdback.</>],
            [<Mono>settleInvoice(id)</Mono>, <>Payable, must equal exact face value. Splits 9000/700/300 bps; supplier leg netted against the streamed advance.</>],
            [<Mono>withdrawYield()</Mono>, "Pulls the caller's accrued share of pool fees."],
            [<Mono>withdrawLiquidity(amount)</Mono>, "Returns principal, capped at liquidity not financing outstanding advances."],
            [<Mono>availableLiquidity()</Mono>, <><Code>totalDeposits - totalOutstandingAdvances</Code> - what can stream or exit.</>],
          ]}
        />
        <H2>The 90/7/3 waterfall</H2>
        <P>
          On settlement the vault computes <Strong>90%</Strong> to the
          supplier (minus whatever was already streamed - that difference
          restores pool principal), <Strong>7%</Strong> to liquidity providers
          via the yield accumulator, and <Strong>3%</Strong> to the protocol
          treasury, with rounding dust absorbed by the treasury leg. If no
          providers exist at settlement, the pool fee routes to the treasury
          instead of being stranded.
        </P>
      </>
    ),
  },
  {
    group: "Protocol",
    key: "value-scale",
    title: "Value scale & settlement",
    body: (
      <>
        <P>
          Invoices are USD-denominated instruments, while the vault moves
          native BOT. The protocol bridges the two with one documented
          constant:
        </P>
        <div className="mt-6 rounded-lg border border-electric/25 bg-electric/[0.05] px-5 py-4 font-mono text-sm text-electric-soft">
          1 USD = 10¹² wei of BOT&nbsp;&nbsp;·&nbsp;&nbsp;$125,000 face value
          = 0.125 BOT settlement
        </div>
        <P>
          Every UI amount you see in dollars maps to real native value at this
          scale - streams, settlements, deposits and yield are all genuine
          mainnet transfers at sane cost. The conversion lives in exactly one
          place (<Code>usdToWei / weiToUsd</Code> in{" "}
          <Code>src/lib/chain.js</Code>), so repointing the protocol at a
          different scale - or a stablecoin - is a one-constant change.
        </P>
        <P>
          <Strong>Why not 1:1?</Strong> Settling a six-figure invoice with
          six figures of BOT would make the demo unusable, and settling with
          raw wei would make value legs invisible dust. 10¹² keeps every
          transaction real, visible and affordable.
        </P>
      </>
    ),
  },
  {
    group: "The AI sentry",
    key: "model",
    title: "The underwriting model",
    body: (
      <>
        <P>
          <Code>syntura-sentry-v1</Code> (<Code>src/agent/aiSentryAgent.js</Code>)
          is a zero-dependency, pure-ESM scoring model that runs identically
          in the browser and in Node. It prices every invoice with seven
          weighted factors:
        </P>
        <KVTable
          rows={[
            ["Debtor credit profile · w 24%", "Corporate-form and adverse name signals plus a log-curve on years trading."],
            ["Repayment history · w 20%", "Laplace-smoothed paid/defaulted record, confidence-weighted by volume."],
            ["Payment term curve · w 15%", "Convex duration risk - longer terms compound exposure."],
            ["Sector risk · w 13%", "Baseline safety table across ten sectors."],
            ["Invoice size band · w 11%", "Concentration watch on outsized face values."],
            ["Due-date proximity · w 9%", "Consistency between stated term and actual due date."],
            ["Fraud signal scan · w 8%", "Round-figure amounts, term mismatches, thin histories, adverse tokens."],
          ]}
        />
        <P>
          The verdict is a risk score (0-100, higher is safer), a tier
          (Low / Medium / High), a discount rate in basis points, an advance
          rate, and a line-by-line rationale - the same rationale you see in
          the app's terminal panels.
        </P>
      </>
    ),
  },
  {
    group: "The AI sentry",
    key: "determinism",
    title: "Determinism & audit hashes",
    body: (
      <>
        <P>
          Determinism is a hard design rule: identical payloads always produce
          identical scores and an identical 256-bit audit hash (an
          FNV-1a/xorshift construction over the payload and scores - keccak256
          planned). There is no randomness anywhere in the model.
        </P>
        <P>
          At underwriting, the hash is written twice: onto the invoice via{" "}
          <Code>underwriteInvoice()</Code> and into{" "}
          <Code>SynturaSentryRegistry</Code> via <Code>commitRiskScore()</Code>,
          emitting <Code>RiskScoreCommitted</Code>. That gives the protocol{" "}
          <Strong>accountable AI</Strong>:
        </P>
        <Bullets
          items={[
            <>Anyone can re-run the open-source model on the same inputs and verify the committed hash byte-for-byte.</>,
            <>A score can never be silently rewritten - the commitment is already public.</>,
            <>Only registry-verified sentry addresses can underwrite; registration is <Code>onlyOwner</Code> with a stated model ID.</>,
          ]}
        />
        <P>
          Run it yourself: <Code>npm run sentry:demo</Code> underwrites a
          sample book in Node and replays one invoice to prove hash equality.
        </P>
      </>
    ),
  },
  {
    group: "Operate",
    key: "deploy",
    title: "Self-hosting & deployment",
    body: (
      <>
        <P>
          The repo is a single npm workspace: Vite + React frontend, Hardhat
          contracts, and the sentry engine shared by both.
        </P>
        <KVTable
          rows={[
            [<Mono>npm install</Mono>, "Install everything."],
            [<Mono>npm run dev</Mono>, "Run the dApp locally."],
            [<Mono>npm run compile</Mono>, "Compile the three contracts (solc 0.8.24, cancun)."],
            [<Mono>npm run deploy:botchain</Mono>, "Deploy + wire all three contracts, register the deployer as sentry, print ready-to-paste VITE_* lines."],
            [<Mono>npm run sentry:demo</Mono>, "Run the AI underwriter standalone in Node."],
          ]}
        />
        <H2>Environment</H2>
        <KVTable
          rows={[
            [<Mono>BOTCHAIN_RPC_URL / _CHAIN_ID</Mono>, "Hardhat deploy target (defaults to the verified mainnet values)."],
            [<Mono>PRIVATE_KEY</Mono>, "Deployer wallet - becomes owner, treasury fallback and the registered sentry."],
            [<Mono>VITE_*_ADDRESS</Mono>, "The three deployed contract addresses; the app reads all state from them."],
            [<Mono>VITE_DEPLOY_BLOCK</Mono>, "First block for event scans - set it to the deploy block to keep reads fast."],
          ]}
        />
        <P>
          Until addresses are configured the app shows an explicitly empty
          state - it never invents data.
        </P>
      </>
    ),
  },
  {
    group: "Trust",
    key: "trust",
    title: "Trust model & FAQ",
    body: (
      <>
        <Bullets
          items={[
            <><Strong>Non-custodial.</Strong> The frontend never holds keys. Every payload is unsigned until your wallet approves it, and all state is read from public contracts.</>,
            <><Strong>Chain-pinned.</Strong> Every call targets chain 677; addresses, hashes and events deep-link to the public explorer.</>,
            <><Strong>Gated underwriting.</Strong> Risk scores can only come from registry-verified sentry addresses - underwriting is the authorization that lets value stream.</>,
            <><Strong>Reentrancy-guarded, pull-based.</Strong> All value-moving functions are non-reentrant; yield and principal leave via pull-payments.</>,
          ]}
        />
        <H2>FAQ</H2>
        <KVTable
          rows={[
            ["Who can mint an invoice?", "Any wallet. Minting alone moves no money - value only flows after a verified sentry underwrites."],
            ["Who is the sentry today?", "The deployer wallet, registered at deployment as syntura-sentry-v1. The registry supports adding independent sentries via governance."],
            ["Who triggers streaming?", "Anyone - it's permissionless. Underwriting is the authorization, and funds can only ever flow to the invoice's onchain supplier."],
            ["What if the debtor never pays?", "The advance stays outstanding and pool utilization reflects it. Credit-default handling (insurance tranche, write-offs) is on the roadmap."],
            ["Is the AI's output binding?", "Yes - the discount and risk score written onchain are what the vault streams against, and the audit hash makes the reasoning permanently checkable."],
          ]}
        />
      </>
    ),
  },
];

const GROUPS = [...new Set(SECTIONS.map((s) => s.group))];

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function Docs() {
  const [active, setActive] = useState(SECTIONS[0].key);
  const index = Math.max(0, SECTIONS.findIndex((s) => s.key === active));
  const section = SECTIONS[index];
  const prev = index > 0 ? SECTIONS[index - 1] : null;
  const next = index < SECTIONS.length - 1 ? SECTIONS[index + 1] : null;

  const select = (key) => {
    setActive(key);
    window.scrollTo(0, 0);
  };

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-abyss/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <button
            type="button"
            onClick={() => goto("landing")}
            className="group flex items-center gap-2.5"
            aria-label="Back to landing page"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] transition-colors group-hover:border-electric/40">
              <Hexagon size={16} className="text-electric" strokeWidth={2.5} />
            </span>
            <span className="text-sm font-extrabold tracking-tight text-white">
              SYNTURA
            </span>
            <span className="font-mono text-[9px] font-medium uppercase tracking-[0.22em] text-slate-600">
              Docs
            </span>
          </button>
          <nav className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => goto("dashboard")}
              className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500 transition-colors hover:text-white"
            >
              App
            </button>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500 transition-colors hover:text-white"
            >
              GitHub
            </a>
          </nav>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-10 lg:grid-cols-[240px_1fr]">
        {/* Section nav */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          {/* Mobile: horizontal chip rail */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin lg:hidden">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => select(s.key)}
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider transition-colors",
                  s.key === active
                    ? "border-electric/40 bg-electric/10 text-electric-soft"
                    : "border-white/10 bg-white/[0.03] text-slate-500"
                )}
              >
                {s.title}
              </button>
            ))}
          </div>
          {/* Desktop: grouped list */}
          <div className="hidden space-y-7 lg:block">
            {GROUPS.map((g) => (
              <div key={g}>
                <p className="eyebrow mb-2.5">{g}</p>
                <ul className="space-y-0.5">
                  {SECTIONS.filter((s) => s.group === g).map((s) => (
                    <li key={s.key}>
                      <button
                        type="button"
                        onClick={() => select(s.key)}
                        aria-current={s.key === active ? "page" : undefined}
                        className={cn(
                          "w-full border-l-2 py-1.5 pl-4 pr-2 text-left text-[13.5px] transition-colors",
                          s.key === active
                            ? "border-electric bg-electric/[0.06] font-medium text-electric-soft"
                            : "border-white/[0.08] text-slate-500 hover:border-white/25 hover:text-slate-300"
                        )}
                      >
                        {s.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </aside>

        {/* Content */}
        <motion.main
          key={section.key}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="min-w-0 max-w-3xl pb-24"
        >
          <h1 className="text-4xl font-extrabold tracking-tight text-white">
            {section.title}
          </h1>
          {section.body}

          {/* Prev / next pagination */}
          <nav
            aria-label="Documentation pagination"
            className="mt-14 grid gap-4 border-t border-white/[0.06] pt-8 sm:grid-cols-2"
          >
            {prev ? (
              <button
                type="button"
                onClick={() => select(prev.key)}
                className="group flex items-center gap-3 rounded-xl border border-white/[0.08] bg-panel/40 px-5 py-4 text-left transition-colors hover:border-electric/40"
              >
                <ChevronLeft
                  size={16}
                  className="shrink-0 text-slate-600 transition-colors group-hover:text-electric"
                />
                <span className="min-w-0">
                  <span className="eyebrow block">Previous</span>
                  <span className="mt-1 block truncate text-sm font-semibold text-slate-200 transition-colors group-hover:text-white">
                    {prev.title}
                  </span>
                </span>
              </button>
            ) : (
              <span className="hidden sm:block" />
            )}
            {next && (
              <button
                type="button"
                onClick={() => select(next.key)}
                className="group flex items-center justify-end gap-3 rounded-xl border border-white/[0.08] bg-panel/40 px-5 py-4 text-right transition-colors hover:border-electric/40 sm:col-start-2"
              >
                <span className="min-w-0">
                  <span className="eyebrow block">Next</span>
                  <span className="mt-1 block truncate text-sm font-semibold text-slate-200 transition-colors group-hover:text-white">
                    {next.title}
                  </span>
                </span>
                <ChevronRight
                  size={16}
                  className="shrink-0 text-slate-600 transition-colors group-hover:text-electric"
                />
              </button>
            )}
          </nav>
        </motion.main>
      </div>
    </div>
  );
}
