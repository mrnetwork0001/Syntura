# Syntura autonomous AI Risk Sentry

An independent service that underwrites tokenized invoices onchain. The supplier
signs one transaction (the mint); this service does the rest.

Each pass it:

1. reads `totalInvoices()` and watches `InvoiceMinted` logs on BOT Chain Mainnet,
2. rebuilds the model payload from chain state plus the token's metadata JSON,
3. reruns the same open-source model the browser runs
   (`../src/agent/aiSentryAgent.js`, model id `syntura-sentry-v1`),
4. submits `SynturaInvoiceNFT.underwriteInvoice(id, riskScore, discountRateBps, auditHash)`
   and then `SynturaSentryRegistry.commitRiskScore(id, riskScore, auditHash)`,
   sequentially, in nonce order.

The model is pinned to the mint block's UTC date, so a verdict produced by a
catch-up sweep days later is byte-identical to the one the supplier's browser
predicted at mint time. Anyone can rerun the model and check the `auditHash`.

The browser never holds a sentry key. This process does, and nothing else.

## Deploy on a VPS

```bash
git clone https://github.com/mrnetwork0001/Syntura.git /opt/syntura
cd /opt/syntura/service
npm ci
cp .env.example .env
chmod 600 .env
$EDITOR .env            # set SENTRY_PRIVATE_KEY, check the addresses
```

`npm ci` runs inside `service/` only. The service imports the shared model by
relative path, so the repo must stay intact around it.

Smoke test one pass (safe: it only sends transactions for invoices that are
genuinely awaiting underwriting):

```bash
node sentry.js --once
```

It exits 0 after a completed pass and 1 if the pass could not run at all, so it
works as-is under cron.

Then install the unit:

```bash
sudo cp syntura-sentry.service /etc/systemd/system/
sudo sed -i 's/SENTRY_USER/syntura/g' /etc/systemd/system/syntura-sentry.service
# the unit assumes the clone lives at /opt/syntura - edit the paths if it does not
sudo systemctl daemon-reload
sudo systemctl enable --now syntura-sentry
journalctl -fu syntura-sentry
```

`ProtectSystem=strict` is on, so keep `STATE_FILE` inside the unit's
`ReadWritePaths`.

## Register the sentry address

`underwriteInvoice` and `commitRiskScore` are gated to registry-verified
sentries. The service logs its address on startup and keeps polling while
unverified, so registration can happen with the service already running. From
the repo root, as the protocol owner:

```bash
npx hardhat console --network botchain
> const reg = await ethers.getContractAt("SynturaSentryRegistry", "0x19B0c0BB8A654b950739B84776A5951BA4ABf676")
> await (await reg.registerSentry("0xYOUR_SENTRY_ADDRESS", "syntura-sentry-v1")).wait()
> await reg.isVerifiedSentry("0xYOUR_SENTRY_ADDRESS")
```

Fund the sentry address with a little BOT for gas. Below 0.01 BOT the service
warns on every start.

## Configuration

All values come from `service/.env`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `BOTCHAIN_RPC_URL` | - | BOT Chain Mainnet RPC endpoint |
| `SENTRY_PRIVATE_KEY` | - | Key of the registered sentry address |
| `INVOICE_NFT_ADDRESS` | - | `SynturaInvoiceNFT` |
| `SENTRY_REGISTRY_ADDRESS` | - | `SynturaSentryRegistry` |
| `START_BLOCK` | `0` | First block that can hold protocol events |
| `POLL_MS` | `6000` | Delay between passes |
| `STATE_FILE` | `./state.json` | Journal path, relative to `service/` |
| `MAX_BLOCK_SPAN` | `2000` | Blocks per `eth_getLogs` request |
| `CONFIRMATIONS` | `1` | Confirmations awaited per transaction |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |

## Behaviour worth knowing

- **Catch-up sweep.** The first pass after every start walks every minted id, so
  invoices minted while the service was down are picked up. Later passes scan
  only new `InvoiceMinted` logs, in `MAX_BLOCK_SPAN` chunks that shrink
  automatically if the RPC rejects the range.
- **Nothing gets stranded.** Failures are journaled per invoice and retried with
  widening spacing. The block watermark only advances after a pass completes, and
  a pass cut short by an RPC outage or a shutdown re-queues every id it did not
  reach. After 6 failed attempts an invoice is quarantined with a loud log line
  and retried on the next restart.
- **Idempotent.** Every invoice is re-read immediately before gas is spent, an
  "already underwritten" revert counts as success, and an invoice that is
  underwritten but missing its registry commitment gets the commitment
  backfilled from the onchain audit hash.
- **Crash-safe state.** `state.json` is written to a temp file and renamed, so it
  is never half-written. Deleting it is safe: the next start sweeps everything
  and the chain is the source of truth.
- **Graceful stop.** SIGINT/SIGTERM finish the in-flight invoice, persist state
  and exit 0. A second signal exits immediately.
- **Backoff.** Provider errors back off exponentially to 60s and reset on the
  first good pass.

## Key handling

- `service/.env` is gitignored and should be `chmod 600`, owned by the service
  user. Nothing in this repo ever prints or logs a key.
- Use a dedicated key for the sentry, never the deployer or treasury key.
- Rotate: generate a new key, `registerSentry(<new address>, "syntura-sentry-v1")`,
  `revokeSentry(<old address>)`, update `SENTRY_PRIVATE_KEY`, then
  `sudo systemctl restart syntura-sentry`. In-flight state is unaffected because
  progress lives onchain.

## Running your own

The sentry set is open: run this service against your own key, get it
registered, and your verdicts are as valid as anyone's. Because the model is
deterministic, two honest sentries produce the same `auditHash` for the same
invoice.
