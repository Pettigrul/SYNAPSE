# Impact Library — Pre-Written Impact Narratives
_Last updated: 2026-06-25_

Ready-to-use impact statements for common vulnerability classes. Adapt the specifics (endpoints, data types, user counts) to the actual finding.

## Remote Code Execution (RCE)
> An unauthenticated attacker can execute arbitrary operating system commands on the server, gaining full control of the application and its underlying infrastructure. This enables data theft, service disruption, lateral movement into internal networks, and persistent backdoor installation. The confidentiality, integrity, and availability of all data processed by this system are fully compromised.

## SQL Injection — Data Extraction
> An attacker can extract the complete contents of the application's database, including user credentials (password hashes), personal information, and business-critical data. With administrative credentials, the attacker achieves full application takeover. Depending on the database configuration, this may escalate to operating system command execution via `xp_cmdshell` (MSSQL) or `COPY TO PROGRAM` (PostgreSQL).

## SQL Injection — Authentication Bypass
> An attacker can bypass the login mechanism entirely, gaining access to any account including administrators, without knowing the password. This gives full control of the application's functionality and all data accessible to the impersonated user.

## IDOR — Read
> An attacker can access other users' data by manipulating the object identifier in the API request. For {N} users, this exposes {data types} including {specific fields}. No elevated privileges are required — any authenticated user can access any other user's records.

## IDOR — Write/Delete
> An attacker can modify or delete other users' data by manipulating the object identifier. This compromises data integrity for all users and can be used for targeted data destruction, financial manipulation, or account hijacking (e.g., changing another user's email to the attacker's, then resetting the password).

## Stored XSS
> An attacker can inject persistent JavaScript that executes in every user's browser when they view the affected page. This enables session hijacking (stealing cookies/tokens), phishing within the trusted domain, keylogging, and cryptocurrency mining. For administrative pages, this achieves full admin account takeover.

## SSRF — Cloud Metadata
> An attacker can force the server to make requests to internal resources, including the cloud metadata endpoint (169.254.169.254). This exposes IAM credentials, which can be used to access cloud resources (S3 buckets, databases, other services) with the permissions of the application's service role — often far broader than the application's own functionality.

## SSRF — Internal Network
> An attacker can scan and interact with internal services that are not exposed to the internet. This bypasses network segmentation, enabling access to admin panels, databases, message queues, and other infrastructure components that rely on network-level access control.

## Authentication Bypass
> An attacker can access protected functionality without valid credentials, gaining the same capabilities as an authenticated user (or administrator, if the bypass reaches admin endpoints). All access controls downstream of the authentication layer are rendered ineffective.

## Privilege Escalation (Web)
> A low-privileged user can escalate their role to administrator by {method}. This grants access to all administrative functionality including user management, configuration, and data export — effectively full application takeover from any authenticated account.

## Privilege Escalation — Local to SYSTEM (Windows)
> A local user can escalate privileges to NT AUTHORITY\SYSTEM via {method}, gaining full control of the operating system. This enables access to all files, credentials (including cached domain credentials via LSASS), and the ability to install persistent backdoors, modify security configurations, and pivot to other systems on the network.

## Privilege Escalation — Domain Admin (AD)
> Starting from {initial access level}, an attacker can escalate to Domain Administrator via the following chain: {chain description}. Domain Admin access compromises the entire Active Directory forest — all user accounts, all computers, all group policies, all data. This is a total organizational compromise.

## Lateral Movement
> From the compromised host ({hostname}), an attacker can move laterally to {N} additional systems using {method}. This expands the blast radius from a single-host compromise to a {segment/domain}-wide breach, accessing data and services across {scope}.

## Credential Access — LSASS Dump
> An attacker with local administrator access can dump LSASS process memory using native Windows tools (comsvcs.dll MiniDump), extracting NTLM hashes and Kerberos tickets for all users currently logged into the system. These credentials enable hash-based authentication attacks against other systems without knowing the plaintext passwords.

## Insecure Deserialization
> The application deserializes user-controlled data using {library/method}, which allows an attacker to execute arbitrary code on the server. This is equivalent to RCE — full server compromise with the privileges of the application's service account.

## Path Traversal — File Read
> An attacker can read arbitrary files from the server's filesystem by manipulating the {parameter} parameter. This exposes configuration files (database credentials, API keys), source code, and sensitive system files (/etc/shadow, web.config). Combined with other findings, leaked credentials often escalate to full system compromise.

## Missing Rate Limit — Login Brute Force
> The login endpoint does not enforce rate limiting, allowing an attacker to test {N} passwords per second. At this rate, common passwords (top 10,000) are exhausted in {time}, and targeted attacks using leaked credential databases are practical. Combined with the lack of account lockout, this enables reliable account takeover for any user with a weak password.
