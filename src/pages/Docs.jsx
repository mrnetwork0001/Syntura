import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Fingerprint,
} from "lucide-react";
import { BOTCHAIN, CONTRACTS } from "../lib/chain.js";
import { cn } from "../lib/utils.js";
import { useSyntura } from "../context/SynturaStore.jsx";
import BrandMark from "../components/ui/BrandMark.jsx";

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

/** Copy-pasteable shell block in the app's terminal-panel language. */
function Shell({ lines }) {
  return (
    <div className="mt-6 overflow-x-auto rounded-xl border border-white/[0.08] bg-panel/40 p-5">
      <pre className="font-mono text-[12.5px] leading-relaxed text-slate-300">
        {lines.map((line, i) => (
          <span key={i} className="block whitespace-pre">
            {line.startsWith("#") ? (
              <span className="text-slate-600">{line}</span>
            ) : (
              <>
                <span className="select-none text-electric">$ </span>
                {line}
              </>
            )}
          </span>
        ))}
      </pre>
    </div>
  );
}

const addr = (a) => (
  <DocLink href={`${BOTCHAIN.explorerUrl}/address/${a}`}>
    <Mono>{a.slice(0, 10)}…{a.slice(-6)}</Mono>
  </DocLink>
);

/**
 * Live document verifier: hash any local file in-browser and compare it to
 * the fingerprint anchored onchain for a chosen invoice. Nothing is uploaded.
 */
function DocVerifier() {
  const { invoices } = useSyntura();
  const anchored = invoices.filter((i) => i.docHash);
  const [selected, setSelected] = useState("");
  const [fileHash, setFileHash] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [busy, setBusy] = useState(false);

  const invoice =
    anchored.find((i) => String(i.id) === selected) ?? anchored[0] ?? null;

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        await file.arrayBuffer()
      );
      setFileHash(
        "0x" +
          [...new Uint8Array(digest)]
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("")
      );
      setFileName(file.name);
    } finally {
      setBusy(false);
    }
  };

  const verdict =
    invoice && fileHash ? (fileHash === invoice.docHash ? "match" : "mismatch") : null;

  return (
    <div className="mt-6 rounded-xl border border-white/[0.08] bg-panel/40 p-5">
      <p className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
        <Fingerprint size={12} className="text-electric" /> Live verifier -
        nothing is uploaded
      </p>
      {anchored.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          No invoices with anchored documents onchain yet - mint one with an
          attached document and it will appear here.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <select
              value={selected || String(invoice?.id ?? "")}
              onChange={(e) => setSelected(e.target.value)}
              className="input-glass"
            >
              {anchored.map((i) => (
                <option key={i.id} value={String(i.id)}>
                  #SYNV-{String(i.id).padStart(3, "0")} · {i.debtorName} ·{" "}
                  {i.docName}
                </option>
              ))}
            </select>
            <input
              type="file"
              onChange={onFile}
              disabled={busy}
              className="block w-full cursor-pointer text-xs text-slate-500 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-electric/15 file:px-3.5 file:py-2 file:font-mono file:text-[10px] file:font-semibold file:uppercase file:tracking-wider file:text-electric hover:file:bg-electric/25"
            />
          </div>
          {invoice && (
            <p className="mt-3 break-all font-mono text-[10px] text-slate-500">
              onchain: {invoice.docHash}
            </p>
          )}
          {fileHash && (
            <p className="mt-1 break-all font-mono text-[10px] text-slate-500">
              your file ({fileName}): {fileHash}
            </p>
          )}
          {verdict && (
            <p
              className={cn(
                "mt-3 inline-flex rounded-full border px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider",
                verdict === "match"
                  ? "border-emeraldx/40 bg-emeraldx/10 text-emeraldx-soft"
                  : "border-rose-500/40 bg-rose-500/10 text-rose-300"
              )}
            >
              {verdict === "match"
                ? "Match - this file is the anchored document"
                : "Mismatch - this is not the anchored document"}
            </p>
          )}
        </>
      )}
    </div>
  );
}

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
          single signed transaction, and each emits an indexed event
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
              <>A registry-verified AI sentry - the autonomous service, not the supplier's wallet - writes the risk score (0-100), discount rate (bps) and the deterministic audit hash of its full reasoning. The same hash is anchored in the registry via <Code>commitRiskScore()</Code>.</>,
            ],
            [
              <Mono>3 · streamPayout()</Mono>,
              <>Permissionless trigger. The vault advances <Code>face × (9000 - discountBps) / 10000</Code> from pooled liquidity straight to the invoice's onchain supplier - once per invoice, bounded by available liquidity.</>,
            ],
            [
              <Mono>4 · settleInvoice()</Mono>,
              <>The debtor approves the vault for <Code>faceValueUnits(id)</Code> USDT, then the vault pulls exactly that and splits it 90% supplier / 7% pool / 3% treasury; the supplier leg is netted against the streamed advance, which returns pool principal.</>,
            ],
          ]}
        />
        <P>
          Liquidity providers sit underneath the whole cycle: they approve and
          deposit USDT into the vault, earn the 7% pool fee from every
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
            [<Mono>faceValueUSD</Mono>, <>Face value as an 18-decimal USD wad (<Code>$1 = 1e18</Code>) - see Units &amp; USDT settlement.</>],
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
          in bridged USDT. All value-moving functions are non-reentrant, and
          transfers out use pull-over-push wherever an actor can claim instead.
        </P>
        <KVTable
          rows={[
            [<Mono>depositLiquidity(amount)</Mono>, <>Pulls <Code>amount</Code> USDT via <Code>transferFrom</Code> - approve the vault first. Adds principal to the pool; pending yield is checkpointed first (MasterChef-style accumulator).</>],
            [<Mono>streamPayout(id)</Mono>, <>Advances <Code>face × (9000 - discountBps) / 10000</Code> to the supplier. Once per invoice; the AI-quoted discount is the pool's holdback.</>],
            [<Mono>settleInvoice(id)</Mono>, <>Pulls exactly <Code>faceValueUnits(id)</Code> USDT from the caller, so the allowance must cover it. Splits 9000/700/300 bps; supplier leg netted against the streamed advance.</>],
            [<Mono>withdrawYield()</Mono>, "Pulls the caller's accrued share of pool fees."],
            [<Mono>withdrawLiquidity(amount)</Mono>, "Returns principal, capped at liquidity not financing outstanding advances."],
            [<Mono>availableLiquidity()</Mono>, <><Code>totalDeposits - totalOutstandingAdvances</Code> - what can stream or exit.</>],
            [<Mono>faceValueUnits(id)</Mono>, <>The invoice's face value converted once to USDT base units - the exact amount settlement pulls.</>],
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
    title: "Units & USDT settlement",
    body: (
      <>
        <P>
          Invoices are USD-denominated instruments, and Syntura settles them in
          real dollars: the vault moves <Strong>bridged USDT on BOTChain</Strong>
          {" "}1:1 against the face value written onchain. Every dollar figure in
          the app is a literal dollar of stablecoin - there is no demo peg
          anywhere in the protocol.
        </P>
        <div className="mt-6 rounded-lg border border-electric/25 bg-electric/[0.05] px-5 py-4 font-mono text-sm text-electric-soft">
          $5.00 invoice&nbsp;&nbsp;·&nbsp;&nbsp;5000000000000000000 face value on
          the NFT&nbsp;&nbsp;·&nbsp;&nbsp;5.000000 USDT pulled at settlement
        </div>
        <P>
          Two scales coexist, one per layer, and each one is explicit in the ABI:
        </P>
        <KVTable
          rows={[
            [
              <Mono>Invoice NFT · USD wad</Mono>,
              <>Face value is stored as an 18-decimal USD wad (<Code>$1 = 1e18</Code>) - a unit of account, not a token balance. <Code>mintInvoice()</Code>, the <Code>faceValueUSD</Code> struct field and the NFT's own events all speak wad.</>,
            ],
            [
              <Mono>Vault · USDT units</Mono>,
              <>Every vault amount is 6-decimal USDT base units (<Code>$1 = 1e6</Code>): deposits, streamed advances, yield, the settlement legs, and all vault views and events.</>,
            ],
            [
              <Mono>USD_WAD_PER_TOKEN_UNIT</Mono>,
              <>The vault converts wad to token units internally by dividing by <Code>1e12</Code> (<Code>1e18 / 1e12 = 1e6</Code>), once per entry point, before any basis-point maths. Truncation drops anything below one micro-dollar, so the vault never pulls more than the debtor owes.</>,
            ],
            [
              <Mono>faceValueUnits(id)</Mono>,
              <>The <Strong>authoritative settlement amount</Strong> in USDT units, read straight from the vault. The dApp and the sentry service read it rather than repeating the conversion - one source of truth for what a debtor owes.</>,
            ],
          ]}
        />
        <H2>Settlement token</H2>
        <KVTable
          rows={[
            ["Asset", <>Bridged <Strong>USDT</Strong> on BOT Chain Mainnet · 6 decimals</>],
            ["Contract", addr(CONTRACTS.usdt)],
            [
              "Gas",
              <>Still native <Strong>BOT</Strong>. USDT moves the value; every transaction - mint, approve, deposit, stream, settle - is paid for in BOT, so a wallet needs both.</>,
            ],
          ]}
        />
        <H2>Approve, then act</H2>
        <P>
          USDT is an ERC-20, so the vault can only pull what it has been allowed
          to pull. Depositing liquidity and settling an invoice are therefore
          two-step flows: an <Code>approve(vault, amount)</Code> transaction,
          then the vault call itself -{" "}
          <Code>depositLiquidity(amount)</Code> or <Code>settleInvoice(id)</Code>,
          neither of them payable any more. The app approves the{" "}
          <Strong>exact</Strong> amount needed, never an unlimited allowance, and
          labels each step while it is in flight. When the existing allowance
          already covers the amount, the approval is skipped and you sign once.
        </P>
        <P>
          Because the numbers are now real money, they are small on purpose: a $5
          invoice settles as exactly <Mono>5.000000</Mono> USDT, split 90 / 7 / 3
          across supplier, pool and treasury on those token units, with rounding
          dust absorbed by the treasury leg.
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
    group: "The AI sentry",
    key: "sentry-service",
    title: "The autonomous sentry service",
    body: (
      <>
        <P>
          The sentry is not a button inside the dApp. Underwriting is performed
          by an independent Node service (<Code>service/sentry.js</Code>) that
          holds its own registry-verified key, watches BOTChain for freshly
          minted invoices, reruns the same open-source model, and submits the
          verdict onchain by itself. <Strong>Supplier and sentry are separate
          actors</Strong> - which is the only reason the risk score is worth
          anything.
        </P>
        <H2>Separation of roles</H2>
        <KVTable
          rows={[
            [
              "Supplier · browser wallet",
              <>Signs exactly <Strong>one</Strong> transaction: <Code>mintInvoice()</Code>. The dApp then polls <Code>getInvoice(id)</Code> and renders the verdict when it lands. It never asks for a permission the supplier does not have.</>,
            ],
            [
              "Sentry · service host",
              <>Holds a dedicated key that the owner registered with <Code>registerSentry(address, "syntura-sentry-v1")</Code>. Rebuilds the payload from chain state, scores it, and sends <Code>underwriteInvoice()</Code> then <Code>commitRiskScore()</Code>.</>,
            ],
            [
              "Registry · onchain gate",
              <>Both writes are gated on <Code>isVerifiedSentry(msg.sender)</Code>, so the service can only speak for itself, and only while it stays registered.</>,
            ],
          ]}
        />
        <P>
          <Strong>The browser never holds the sentry key.</Strong> It lives only
          in <Code>service/.env</Code> on the machine running the service -
          gitignored, never bundled, never shipped to a visitor. Before this
          split, a supplier who minted got an invoice stranded at "Awaiting AI"
          forever, because their own wallet was not a verified sentry. Now the
          mint is a single approval and the underwriting arrives on its own,
          usually within a tick or two.
        </P>
        <P>
          Because both sides run the identical model, the mint screen can
          compare the verdict it reads back from the chain against the one it
          predicted locally before minting. When the risk score, discount rate
          and audit hash match exactly - they always should - the UI says so.
          That is determinism demonstrated by two independent processes rather
          than asserted in a doc.
        </P>
        <H2>What one tick does</H2>
        <Bullets
          items={[
            <>Reads <Code>totalInvoices()</Code>, then scans <Code>InvoiceMinted</Code> logs from the last processed block in bounded chunks. On a cold start - or whenever the state file is missing - it sweeps every id from <Mono>1</Mono> to <Mono>totalInvoices</Mono> instead, so invoices minted while the service was down are still collected.</>,
            <>Rebuilds the model payload from the invoice struct plus <Code>tokenURI(id)</Code> metadata: debtor, face value as an 18-decimal USD wad, due date, sector, supplier name and term days, deriving term days from the mint block timestamp when the metadata is thin.</>,
            <>Runs the same <Code>underwriteInvoice()</Code> model the browser runs, then re-reads <Code>getInvoice(id)</Code> as a race guard immediately before sending.</>,
            <>Sends <Code>underwriteInvoice()</Code> and <Code>commitRiskScore()</Code> sequentially - nonce order matters - awaiting confirmations between them, and logs one structured line per invoice carrying both tx hashes.</>,
            <>Persists <Code>{"{ lastProcessedBlock, pending, done }"}</Code> atomically, so a restart resumes exactly where it stopped.</>,
          ]}
        />
        <P>
          <Strong>Nothing gets stranded.</Strong> Each invoice is handled inside
          its own try/catch: a failure records the id in <Code>pending</Code>
          {" "}for retry on later ticks with a bounded attempt count, and never
          stops the loop. Provider errors back off exponentially (capped around
          a minute) and reset on the next success. A revert that means "already
          underwritten" is treated as success, not as an error to retry forever.
          On <Code>SIGINT</Code>/<Code>SIGTERM</Code> the service finishes the
          in-flight invoice, persists state, and exits cleanly.
        </P>
        <H2>Configuration</H2>
        <P>
          Everything is environment-driven from <Code>service/.env</Code>;{" "}
          <Code>service/.env.example</Code> ships with the live mainnet
          addresses and deploy block prefilled and a key placeholder.
        </P>
        <KVTable
          rows={[
            [<Mono>BOTCHAIN_RPC_URL</Mono>, <>Read/write RPC endpoint - defaults to <Mono>{BOTCHAIN.rpcUrl}</Mono>.</>],
            [<Mono>SENTRY_PRIVATE_KEY</Mono>, "The service's own registered sentry key. Provisioned separately from the deployer key and never committed."],
            [<Mono>INVOICE_NFT_ADDRESS</Mono>, "The SYNV contract the service reads invoices from and underwrites on."],
            [<Mono>SENTRY_REGISTRY_ADDRESS</Mono>, "Where the audit hash is committed, and the contract that verifies the service's own address at startup."],
            [<Mono>START_BLOCK</Mono>, <>First block for the log scan - the deploy block <Mono>19906390</Mono> keeps cold starts fast.</>],
            [<Mono>POLL_MS</Mono>, <>Tick interval in milliseconds. Default <Mono>6000</Mono>.</>],
            [<Mono>MAX_BLOCK_SPAN</Mono>, <>Log-scan chunk size, so a long catch-up never asks the RPC for too wide a range. Default <Mono>2000</Mono>.</>],
            [<Mono>CONFIRMATIONS</Mono>, <>Confirmations awaited per transaction before the next one is sent. Default <Mono>1</Mono>.</>],
            [<Mono>STATE_FILE</Mono>, <>Path to the JSON cursor written atomically each tick. Default <Mono>./state.json</Mono>.</>],
          ]}
        />
        <H2>Running it</H2>
        <Shell
          lines={[
            "cd service && npm ci",
            "# one pass over every outstanding invoice, then exit 0",
            "node sentry.js --once",
            "# or watch continuously",
            "npm start",
          ]}
        />
        <P>
          <Code>--once</Code> processes a single pass and exits <Mono>0</Mono>,
          which makes the same binary usable as a cron job, a smoke test after
          deployment, or a manual catch-up run. For continuous operation the
          repo ships <Code>service/syntura-sentry.service</Code>, a hardened
          systemd unit (<Code>Restart=always</Code>,{" "}
          <Code>NoNewPrivileges</Code>, <Code>ProtectSystem=strict</Code>) that
          reads the same <Code>.env</Code> and logs to the journal -{" "}
          <Code>journalctl -fu syntura-sentry</Code>. The full VPS runbook,
          including key rotation, is in <Code>service/README.md</Code>.
        </P>
        <H2>Run your own sentry</H2>
        <P>
          Nothing about the service is privileged. It is ~400 lines of ESM
          against two public contracts, using the exact model in this repo.
          Generate a key, have the registry owner register the address with your
          own model ID, point the <Code>.env</Code> at the same contracts, and
          your agent underwrites alongside the reference one. Several sentries
          can watch the same chain safely: the invoice's underwritten flag makes
          the write single-shot, so the first verdict to land wins and the
          others skip it. Turning disagreement between independent models into a
          priced risk signal is the next step - see the compliance roadmap.
        </P>
        <P>
          Operators who do hold a verified sentry wallet in the browser keep a
          manual path: the mint screen and the dashboard both expose an
          underwrite action on pending invoices, signed by the connected wallet.
          It is a fallback for when the service is down, not the normal flow.
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
            [<Mono>VITE_*_ADDRESS</Mono>, <>The three deployed contract addresses; the app reads all state from them. <Code>VITE_USDT_ADDRESS</Code> overrides the settlement token, which defaults to the bridged USDT in Units &amp; USDT settlement and is also required for live mode.</>],
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
    key: "authenticity",
    title: "Asset authenticity & compliance",
    body: (
      <>
        <P>
          The hardest problem in RWA is proving the asset is real. Syntura's
          position: make every claim <Strong>cryptographically anchored and
          publicly checkable</Strong> from day one, then harden the
          real-world bridge in layers.
        </P>
        <H2>Live today: document anchoring</H2>
        <P>
          When a supplier mints, they can attach the underlying invoice
          document (PDF, image, export). The file is hashed{" "}
          <Strong>in the browser</Strong> with SHA-256 - it is never uploaded
          anywhere - and the fingerprint is committed onchain inside the mint
          transaction's token metadata. That binds the NFT to one exact
          real-world document:
        </P>
        <Bullets
          items={[
            <>Any counterparty holding the original file can re-hash it and prove it matches the token - byte-for-byte.</>,
            <>A tampered or substituted document produces a different hash, and the mismatch is provable without trusting Syntura.</>,
            <>The supplier's privacy is preserved: the chain stores a 32-byte fingerprint, not the invoice contents.</>,
          ]}
        />
        <DocVerifier />
        <H2>Also live: accountable underwriting</H2>
        <P>
          Authenticity is not only about the document - it is about who vouched
          for the risk. Every underwriting verdict is produced by a
          registry-verified sentry and committed with a deterministic audit
          hash, so the judgment layer is as checkable as the asset layer.
        </P>
        <H2>The compliance roadmap</H2>
        <KVTable
          rows={[
            ["Debtor attestation", "The debtor counter-signs the invoice hash (EIP-712), upgrading self-attested claims to two-party attested assets."],
            ["Independent sentries", "Third-party underwriting agents register with their own model IDs; disagreement between sentries becomes a priced risk signal."],
            ["Compliance module", "Allow-listed participants (KYB attestations) as an optional market tier for regulated liquidity."],
            ["Legal assignment", "Off-chain receivable-assignment agreements referencing the onchain token ID, closing the enforceability loop."],
            ["Default handling", "First-loss tranche and write-off mechanics for non-paying debtors."],
          ]}
        />
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
            ["How do I know the invoice is real?", "Attach-and-anchor: the document's SHA-256 fingerprint is committed onchain at mint and anyone holding the file can verify it - see Asset authenticity & compliance."],
            ["Who is the sentry today?", "An autonomous service running syntura-sentry-v1 under its own registered key - it watches for new invoices and underwrites them without any user involvement. See The autonomous sentry service; the registry supports adding independent sentries via governance."],
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
              <BrandMark size={18} />
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
