# Security policy

## Supported version

The latest tagged TalentLedger release is supported.

## Trust boundary

This repository never needs direct PostgreSQL access. It sends product-scoped requests to managed-oss-cloud with a bearer token. The backend is responsible for authentication, tenant isolation, plan checks, storage accounting, AI job isolation, and durable audit evidence.

The web server keeps that API token server-side and requires a separate browser access key. Deploy it behind HTTPS and additional access control whenever it is reachable beyond loopback.

## Report a vulnerability

Use GitHub's private security advisory flow for this repository. Do not open a public issue containing tokens, personal data, exploit details, or customer records.
