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

## Safe to run beside other services

This process is deliberately boring infrastructure and cannot collide with
anything already on the box:

- **Binds no ports.** It is an outbound poller. No listener, so no port
  conflict, no firewall rule, no reverse-proxy entry.
- **Installs nothing globally.** `npm ci` writes only to `service/node_modules`.
  There is no `npm i -g`, no system package, no PATH change.
- **Touches no shared config.** It never edits nginx, Caddy, Docker, cron or
  any other unit. The only file it writes at runtime is its own `state.json`.
- **Own systemd unit and user.** `syntura-sentry` running as a dedicated
  unprivileged user, hardened with `ProtectSystem=strict`, `ProtectHome`,
  `NoNewPrivileges` and a single `ReadWritePaths` entry.
- **Tiny footprint.** One Node process, idle between 6-second polls; a few
  dozen MB of RSS.
- **Fully reversible.** See Uninstall below - one command and every trace is
  gone.

If another Node app pins an older runtime, do not touch the system Node.
Install a private copy and point the unit at it:

```bash
curl -fsSL https://nodejs.org/dist/v22.11.0/node-v22.11.0-linux-x64.tar.xz \
  | sudo tar -xJ -C /opt --transform 's|^node-v22.11.0-linux-x64|syntura-node|'
# then in the unit: ExecStart=/opt/syntura-node/bin/node sentry.js
```

Nothing else on the machine sees that binary - no symlinks, no PATH edits.

## Deploy on a VPS

Do not paste this page as one block - step 2 runs on your own machine, and
`sudo systemctl start` must wait until the smoke test passes.

**Step 1 - on the VPS.** Create the user and the clone:

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin syntura
sudo git clone https://github.com/mrnetwork0001/Syntura.git /opt/syntura
cd /opt/syntura/service
sudo npm ci --omit=dev
```

`useradd` reporting "already exists" is fine if that account is yours; on a
shared host confirm it is not someone else's with `id syntura` first.

**Step 2 - on your own machine.** Copy up the `.env` holding the sentry key:

```bash
scp service/.env user@your-vps:/tmp/syntura.env
```

No local `.env` yet? Copy `.env.example` to `.env`, set `SENTRY_PRIVATE_KEY` to
a dedicated key, and register its address (see below). Editing the file
directly on the VPS with `sudo nano /opt/syntura/service/.env` works too.

**Step 3 - back on the VPS.** Put it in place and smoke test BEFORE installing
the unit:

```bash
sudo mv /tmp/syntura.env /opt/syntura/service/.env
sudo chmod 600 /opt/syntura/service/.env
sudo chown -R syntura:syntura /opt/syntura

cd /opt/syntura/service && sudo -u syntura node sentry.js --once
```

Expect the wallet address, `sentry is registry-verified`, a catch-up sweep line
and a clean stop. If instead you see `BOTCHAIN_RPC_URL is not set`, the `.env`
did not land - fix that before continuing, or systemd will restart-loop on a
missing `EnvironmentFile`.

`npm ci` runs inside `service/` only. The service imports the shared model by
relative path, so the repo must stay intact around it.

`--once` is safe to rerun at any time: it only sends transactions for invoices
genuinely awaiting underwriting, exits 0 after a completed pass and 1 if the
pass could not run at all, so it also works as-is under cron.

**Step 4 - install the unit**, only after step 3 printed a clean pass:

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

## Uninstall

```bash
sudo systemctl disable --now syntura-sentry
sudo rm /etc/systemd/system/syntura-sentry.service
sudo systemctl daemon-reload
sudo rm -rf /opt/syntura
sudo userdel syntura
```

Nothing else on the host is affected. Onchain state is untouched - a new sentry
can be registered and started at any time, and the catch-up sweep picks up
whatever was missed.

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
