# Family Board

A private household dashboard for tablets and phones. The agenda reads from
the family's shared Google Calendar, and GitHub Actions deploys the app to
Cloudflare Workers. The footer shows the first seven characters of the commit
running in production.

## Local development

```sh
npm ci
npm run dev
npm test
npm run build
```

Vite serves a local preview with sample data. In production, the Worker
validates the signature, issuer, audience, and expiry of the Cloudflare Access
JWT before serving the UI, static assets, or API. The private `/api/status`
endpoint checks the D1 connection.

## Initial setup

1. In **Cloudflare → Workers & Pages**, set up a `workers.dev` subdomain for
   your account. In **Storage & databases → D1**, create the `family-board`
   database.
2. In [GitHub Actions variables](https://github.com/ManelPNavarro/family-board/settings/variables/actions),
   set `D1_DATABASE_ID` to the database ID. In
   [GitHub Actions secrets](https://github.com/ManelPNavarro/family-board/settings/secrets/actions),
   add `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. Use **Account Settings
   → Read** and **Workers Scripts → Edit**, scoped to the Family Board account.
   Once the Worker exists, you can scope edit access to that Worker.
3. Run the **Family Board** workflow on `main` from GitHub Actions. This first
   deployment registers the Worker with its URL and previews disabled.
4. Set up [Cloudflare Zero Trust Free](https://developers.cloudflare.com/cloudflare-one/setup/).
   Cloudflare asks for a payment method during free plan signup. Enable
   **One-time PIN** as a login method. In **Workers & Pages → family-board →
   Access**, protect **All traffic**. In the Access application, create an
   **Allow** policy with **Include → Emails** and enter the family's exact
   email addresses. Select **One-time PIN** and set the application session
   to **7 days**. In **Access settings**, set the global session to **1 month**.
   The global duration applies to applications in that Zero Trust team.
5. Copy the Zero Trust team name (the part before `.cloudflareaccess.com`) and
   the application's **Application Audience (AUD)**. Save them as
   `ACCESS_TEAM` and `ACCESS_AUD` in GitHub Actions variables. Run the workflow
   again. With both variables set, Wrangler enables
   `https://family-board.<subdomain>.workers.dev`.
6. Open the URL and `/api/status` in a private window. Access should require
   sign-in. Sign in with an approved email and confirm the dashboard reports
   that D1 is connected and shows the deployed commit. Subsequent pushes to
   `main` deploy automatically after checks pass.

Store integration credentials in GitHub Actions secrets. The deployment
installs them as Worker secrets, and the Worker makes authenticated
third-party requests.

- [Cloudflare Access for Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
- [Cloudflare Access session durations](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/)
- [Deploy Workers with GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)

## Shared Google Calendar

Family Board reads one calendar. The home view shows today's events, and the
calendar view shows seven days starting today.

1. In a Google Cloud project, enable the **Google Calendar API** and create a
   service account for Family Board. It needs no project IAM roles or
   domain-wide delegation.
2. In Google Calendar, open **Settings and sharing** for the family calendar.
   Add the service account's email with **See all event details** permission.
   Under **Integrate calendar**, copy the calendar ID.
3. Create a JSON key for the service account. Save the full JSON key as
   `GOOGLE_CALENDAR_SERVICE_ACCOUNT` and the calendar ID as
   `GOOGLE_CALENDAR_ID` in
   [GitHub Actions secrets](https://github.com/ManelPNavarro/family-board/settings/secrets/actions).
4. Run the **Family Board** workflow on `main`. Sign in through Cloudflare
   Access and compare the agenda with the original calendar.

The Worker obtains a short-lived token with read-only access to events. It
returns event titles and times, hides private event titles, and stores no
events in D1. To revoke access, remove the service account from the calendar
or revoke its key in Google Cloud. To remove the stored configuration,
delete the two secrets from both GitHub Actions and the Worker.

- [Share a Google Calendar](https://support.google.com/calendar/answer/37082)
- [Create a service account](https://docs.cloud.google.com/iam/docs/service-accounts-create)
- [Create a JSON key](https://docs.cloud.google.com/iam/docs/keys-create-delete)

## Shopping list

Install the full Family Board from `/` to open on the dashboard.
Open `/#compra` to go directly to the shopping list. Older `/compra/`
shortcuts redirect to the main app. Everyone authorized to use
Family Board shares the same list, stored in the Worker's D1 database.

For a new database, apply the migrations in `migrations/` before deploying
the version that needs them. Sign in to Wrangler with D1 access and generate
the deployment configuration with `npm run deploy:config`, then run:

```sh
npx wrangler d1 migrations apply DB --remote --config .wrangler.deploy.json
```

## Weather

The home view shows a forecast from [Open-Meteo](https://open-meteo.com/)
when the deployment receives the `WEATHER_LOCATION` GitHub Actions secret.
Set it to a JSON object with `name`, `latitude`, and `longitude`, using
approximate coordinates for the municipality. Run the **Family Board**
workflow on `main` to apply the setting.

The Worker caches the forecast for 15 minutes. The precipitation percentage
is the highest hourly probability forecast for the day.

## Smart Life light

The Casa page can control one light through Tuya's cloud API.

1. Create a [Tuya Smart Home cloud project](https://developer.tuya.com/en/docs/developer/apply-cloud-api-key?id=Kff30z8sv62ah)
   in the data center that serves your Smart Life account. Authorize the
   required cloud services and link the account by scanning the project QR
   code in the Smart Life app.
2. Find the light's Device ID in **Devices → All Devices**. In Tuya's API
   Explorer, check that the device status includes a boolean power code and
   that the same code is listed in the device's instruction set.
3. Create the repository's **GitHub Actions secret** `TUYA_LIGHT` with this
   shape, substituting the actual credentials and device ID:

   ```json
   {
     "region": "western-eu",
     "clientId": "TUYA_ACCESS_ID",
     "clientSecret": "TUYA_ACCESS_SECRET",
     "deviceId": "LIGHT_DEVICE_ID"
   }
   ```

   Use `central-eu` for Central Europe or `western-eu` for Western Europe.
   Add `"switchCode": "<power code>"` only if the device uses a code other
   than `switch_led`. Keep these values out of the repository.
4. Run **Family Board** on `main` and open `/#casa`. The Worker only allows
   commands for the configured device. Everyone authorized by the existing
   Cloudflare Access policy can use the controls. Requests still depend on
   the Tuya cloud project and its active API subscription or trial.

## Roborock status probe

The protected `/api/home/roborock` endpoint checks whether the Roborock cloud
can report the Q7 L5+ status. It returns the available battery level, online
flag, and provider state code. The cloud response is a snapshot. Casa also
queries the device via TLS MQTT for its three most recent cleaning records.
For an older session created before cleaning history was added, repeat the setup
below and replace the existing secret.

1. On a Mac with Python 3.11 or newer, run these commands from the repository.
   Enter the Roborock app email and the verification code sent by Roborock.

   ```sh
   setup_dir="$(mktemp -d)"
   python3 -m venv "$setup_dir"
   "$setup_dir/bin/python" -m pip install python-roborock==7.33.0
   "$setup_dir/bin/python" scripts/roborock-session.py | pbcopy
   ```

2. Create the [GitHub Actions secret](https://github.com/ManelPNavarro/family-board/settings/secrets/actions)
   `ROBOROCK_SESSION` and paste the clipboard contents into its value. Clear
   the clipboard after saving. The script never needs an account password.
3. Run **Family Board** on `main` and open `/api/home/roborock` on the
   usual Family Board URL after signing in with Cloudflare Access.
