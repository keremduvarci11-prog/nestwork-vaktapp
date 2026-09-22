# Android push-oppsett

Android-appen bruker Firebase Cloud Messaging (FCM) via Capacitor Push
Notifications. Pakkenavnet er `no.nestwork.vaktapp`, endepunkter lagres som
`fcm://<token>`, og varslingskanalen er `nestwork_updates`.

## Firebase-klient

1. Opprett eller velg Firebase-prosjektet som skal brukes i produksjon.
2. Registrer en Android-app med nøyaktig pakkenavn
   `no.nestwork.vaktapp`.
3. Last ned Firebase-filen `google-services.json`.
4. Legg filen lokalt/igjennom den sikre CI-konfigurasjonen på
   `android/app/google-services.json`.
5. Kjør Capacitor-synkronisering når web/native-avhengigheter oppdateres.

`google-services.json` er prosjektspesifikk konfigurasjon og skal ikke
oppdiktes. Den finnes med hensikt ikke i dette repositoriet. En release-bygg
feiler med en tydelig melding dersom filen mangler. En ny Android-binær må
bygges og publiseres etter at filen er lagt inn; eldre binærer inneholder ikke
FCM-oppsettet. Det fjernlastede webgrensesnittet oppdager eldre Android-binærer
uten plugin og hopper over registreringen uten gjentatte native feil.

### Codemagic

Codemagic bygger fra GitHub `main`, ikke direkte fra Replit. Endringene må
derfor synkroniseres til den grenen før en bygg startes. Legg
`google-services.json` inn som den krypterte Codemagic-variabelen
`ANDROID_GOOGLE_SERVICES_JSON_BASE64`. Android-workflowen har et obligatorisk
steg før `npx cap sync android` som dekoder verdien uten å skrive den til
loggen:

```sh
test -n "$ANDROID_GOOGLE_SERVICES_JSON_BASE64" || {
  echo "Missing ANDROID_GOOGLE_SERVICES_JSON_BASE64" >&2
  exit 1
}
printf '%s' "$ANDROID_GOOGLE_SERVICES_JSON_BASE64" |
  base64 --decode > android/app/google-services.json
test -s android/app/google-services.json
```

Hemmeligheten må gjøres tilgjengelig for `android-release`-workflowen. Steget
stanser workflowen ved manglende, ugyldig eller tom verdi. Gradle stanser både
`bundleRelease` og `assembleRelease` dersom filen mangler. Når filen finnes,
kjører Google Services-pluginen og avviser konfigurasjon som ikke inneholder en
klient for pakken `no.nestwork.vaktapp`.

På Android 13 og nyere ber appen om `POST_NOTIFICATIONS` ved registrering.
Native oppstart oppretter kanalen `nestwork_updates`, og Firebase bruker det
hvite statusikonet `ic_stat_nestwork`.

## Server

Sett serverhemmeligheten `FIREBASE_SERVICE_ACCOUNT_JSON` til hele JSON-innholdet
fra en Firebase Admin SDK service account for det samme prosjektet. Ikke legg
service account-filen eller verdien i Git.

Klientens Firebase-prosjekt og service account-prosjektet må være det samme.
Etter utrulling verifiseres registrering og levering med en testkonto og fysisk
Android-enhet. Ikke bruk produksjonsbrukere til testutsendelser.