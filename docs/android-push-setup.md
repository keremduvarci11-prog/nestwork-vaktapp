# Android push-oppsett

Android-appen bruker Firebase Cloud Messaging (FCM) via Capacitor Push
Notifications. Pakkenavnet er `no.nestwork.vaktapp`, endepunkter lagres som
`fcm://<token>`, og varslingskanalen er `nestwork_updates`.

## Firebase-klient

1. Opprett eller velg Firebase-prosjektet som skal brukes i produksjon.
2. Registrer en Android-app med nøyaktig pakkenavn
   `no.nestwork.vaktapp`.
3. Last ned Firebase-filen `google-services.json`.
4. Legg Android-konfigurasjonen på `android/app/google-services.json`.
5. Kjør Capacitor-synkronisering når web/native-avhengigheter oppdateres.

`google-services.json` er prosjektspesifikk konfigurasjon og skal ikke
oppdiktes. Denne filen inneholder offentlige appidentifikatorer og følger
repositoriet. Den må ikke forveksles med den private Admin SDK-nøkkelen.
Et release-bygg
feiler med en tydelig melding dersom filen mangler. En ny Android-binær må
bygges og publiseres etter at filen er lagt inn; eldre binærer inneholder ikke
FCM-oppsettet. Det fjernlastede webgrensesnittet oppdager eldre Android-binærer
uten plugin og hopper over registreringen uten gjentatte native feil.

### Codemagic

Codemagic bygger fra GitHub `main`, ikke direkte fra Replit. Endringene må
derfor synkroniseres til den grenen før et bygg startes. Workflowen bruker
Android-konfigurasjonen fra repositoriet. Ingen ekstra Codemagic-hemmelighet
er nødvendig. Variabelen `ANDROID_GOOGLE_SERVICES_JSON_BASE64` kan fortsatt
brukes som en eksplisitt overstyring for andre byggmiljøer.

Før Capacitor-synkronisering validerer workflowen filen uten å skrive
innholdet til loggen. Manglende/ugyldig fil, feil pakkenavn eller en
service-account-fil stanser bygget. Gradle stanser både
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