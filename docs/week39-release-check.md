# Uke 39 – leveransekontroll

Kontrollert 17. september 2026. Status: **kort og ruter er nå publisert; ny rettelse som skjuler ferdige planer er bygget lokalt og må publiseres på nytt.**

## Siste kontroll etter brukerens publisering

- Produksjon laster nå `/assets/index-BsqNLVJd.js`, med kortene og begge planendepunktene. Begge uautentiserte GET-kall gir nå 401 JSON, som forventet for beskyttede adminruter.
- Brukeren opplyser å ha publisert og bekreftet i appen, men at kortene fortsatt står der. Den tidligere komponenten beholdt kortene også ved vellykket lagring.
- Rettelsen skjuler hvert kort straks lagringen lykkes og viser i stedet en kort resultatmelding. Ved ny sideåpning brukes den eksisterende skrivebeskyttede forhåndsvisningen automatisk: fem unike vakt-ID-er, alle fem forventede datoer, bare `reuse` og ingen konflikter betyr at kortet skjules. Dette fungerer uten lokal lagring og uten ny bekreftelse.
- Ufullstendige planer, manglende tildelinger og konflikter skjules ikke. Lesefeil regnes ikke som ferdig behandling. Åpning av en uferdig plan henter fersk forhåndsvisning/bekreftelsestoken.
- Ingen serverruter, vaktvilkår, tildelingsregler eller databaseskjema ble endret.
- `npm run check`, `npm run build` og 15 tester (inkludert tre nye fullføringsregresjonstester) bestod. Ny lokal hovedpakke er `/assets/index-D0rETZ1z.js`.
- Utviklingsserveren ble startet på nytt og svarer. Skjermbilde uten innlogging viser fungerende innloggingsside. Den nye skjulingen er ikke visuelt kontrollert i en innlogget produksjonsøkt; de tidligere isolerte mobilbildene nedenfor viser den opprinnelige bekreftelsesflyten.

**Gjenstår:** Publishing → Republish én gang til for skjulerettelsen, deretter åpne appen på nytt på «Ny vakt». Ikke bekreft vaktene på nytt bare for å fjerne kortet.

## Før brukerens første nye publisering

- Publiseringsmetadata bekrefter https://nestwork-shift-manager.replit.app som offentlig produksjonsadresse.
- Produksjonens `/admin/ny-vakt` lastet `/assets/index-C4qVex8g.js`. Pakken inneholdt det manuelle skjemaet, men ikke `week39-plan`, `Klargjort:` eller `Kontroller og vis fem vakter`.
- Uautentiserte GET-kall til begge produksjonsendepunktene `/api/admin/week39-plan` og `/api/admin/week39-plan/sultan` returnerte HTML (200), ikke API-svar. Dette viser at den gamle leveransen mangler rutene, ikke at administratortilgangen er feil.
- `npm run build` bestod og bygget `/assets/index-BsqNLVJd.js` samt `dist/index.cjs`. Begge API-stiene finnes i frontend- og serverpakken; korttekst og manuelt skjema finnes i frontendpakken.
- Eksisterende publiseringsoppsett bygger med `npm run build` og kjører `node dist/index.cjs`. Ingen endring i funksjonskode, publiseringsoppsett eller mobilkonfigurasjon var nødvendig. `dist` er generert og ikke versjonskontrollert; publisering bygger på nytt.
- Capacitor bruker produksjonsadressen som `server.url`. Ingen dokumentert grunn til ny mobilbinær.

## Kontroller

- `npx tsx --test server/week39.test.ts shared/shiftHours.test.ts`: 12 beståtte tester.
- `NODE_ENV=development RUN_WEEK39_INTEGRATION=1 npx tsx --test server/week39.integration.test.ts`: én bestått integrasjonstest i separat, midlertidig PostgreSQL-skjema, ryddet etter testen. Varslings- og synkfunksjoner var erstattet med testfunksjoner. Testen dekker blant annet rollback, samtidige forsøk/gjenbruk, vilkår, tokenbinding og synkkø.
- Utviklingsserveren svarer 401 på uautentisert GET til planruten, som forventet.
- Mobilnettleser, 390 × 844: begge kort over det eksisterende manuelle skjemaet, begge forhåndsvisninger med fem rader og riktige vilkår. Synnes bekreftelsesknapp er deaktivert uten kode/avkrysning og aktiveres først med begge. Ingen sluttbekreftelse ble klikket; null muterende API-kall.
- Nettleserkontrollen brukte syntetisk administrator og avskårne API-svar. Dette bekrefter UI, **ikke** produksjonsidentiteter, produksjonsdata eller en ekte innlogget økt. Service worker måtte blokkeres i testkonteksten for at alle API-svar skulle forbli isolert.
- Det manuelle skjemaets dato, tider, timer, søk, beskrivelse og vikarkode var brukbare. Barnehagelisten var tom i testdataene; faktisk manuell lagring ble ikke testet.
- Skjermbilder i testresultatet: begge kort `nuujw2`, Synne utvidet `alsw2k`, bekreftelsesvilkår `mn3rxd`, Sultan utvidet `1wpfif`, manuelt skjema `1cqqim`.

## Bevarte vaktvilkår

Alle datoer er i 2026:

| Dato | Synne – Løvstakken | Sultan – Hjellemarka Fus |
|---|---|---|
| 21.09 | 09:00–16:30 | 07:45–15:15 |
| 22.09 | 08:30–16:00 | 07:45–15:15 |
| 23.09 | 08:00–15:30 | 07:45–15:15 |
| 24.09 | 07:30–15:00 | 07:45–15:15 |
| 25.09 | 09:00–16:30 | 07:45–15:15 |

Synne: avtalt betalt pause, 37,5 betalte timer. Sultan: standard 30 minutters pausefratrekk per dag, 35 betalte timer.

## Overlevering

1. Åpne **Publishing → Republish** i Replit igjen for skjulerettelsen. Dette er publisering av kode, ikke bekreftelse av vaktene. Eventuelle databaseadvarsler i publiseringsdialogen må vurderes; denne kontrollen har ikke endret databaseskjemaet.
2. Etter vellykket publisering: kontroller offentlig HTML/pakke og begge API-rutene på nytt. Hash kan variere ved nytt bygg; kontroller innholdet, ikke bare filnavnet.
3. Åpne appen på nytt som administrator og gå til **Ny vakt**. Ferdige planer skal være borte; uferdige eller konfliktfylte planer blir stående. Agenten har ikke brukt lagrede administratoropplysninger.
4. Bare hvis en plan faktisk gjenstår, velger brukeren selv vikarkode og bekrefter opprettelse/tildeling etter gjennomgang.

**Separate statuser:** Lokal bygging bestått. Opprinnelig kort-/API-leveranse bekreftet publisert. Brukeren opplyser at bekreftelse er utført. Skjulerettelsen er ennå ikke bekreftet publisert eller visuelt kontrollert innlogget. Ingen reelle vakter opprettet eller tildelt av agenten. Produksjonsvakter, varslingslevering og Google-ark er ikke separat verifisert.

## Ikke-blokkerende observasjoner

Bygget ga advarsler om Browserslist, PostCSS og pakkestørrelse, men fullførte. Den allerede kjørende utviklingsserveren logget en duplikatbrukerfeil i oppstartssynk, men startet og betjente rutene. Ingen av disse observasjonene ble dokumentert som årsak til den gamle produksjonspakken; de ble ikke endret i denne leveransen.