---
name: Vaktlogg Google Sheet
description: Hvilket ark vaktlogg-synken peker på og plasseringsregler
---
- Originalarket «Nestwork timer jobbet»: ID `1fd7xZET8otXv3uVFThpPq96pKsE3EDidNAMfjuVNZFA`, fane Sheet1 (gridId 0). Satt via shared env `VAKT_SHEET_ID`.
- Brukerens gamle ark var en Excel-fil (.xlsx i Drive) — Sheets API nekter Office-filer; bruker konverterte manuelt.
- Regel: nye vakter skal sorteres inn på dato INNE i ukeblokken (samme dag samlet), aldri nederst i blokken. Fikset i sheetSync.
- Kolonne P (vakt-ID) er skjult i arket. Uke 34–37-vakter for Lucas/Saada/Sandra er backfillet med ID-er.
- Sheets-synk kjører kun der appen kjører — prod var ikke publisert med synk per aug 2026.
- Abderrahmane Saada føres som «9088 Saada» i arket; prod-externalId oppdatert til 9088 (var 81126). NB: synken skriver fornavn («Abderrahmane»), så auto-oppdatering vil overskrive «Saada» — vurder navnebytte hvis det plager brukeren.
- Ingebjørg Helland føres som «9091 Ingebjørg» — prod-externalId rettet til 9091 (var 91478).
- Publisert app (aug 2026) kjører gammel synk: skriver til TEST-arket (fallback-ID) og legger rader nederst. Må republiseres for at synk skal treffe originalarket sortert. 77 vakter (Roza/Gavin/Ingebjørg sep–okt) er manuelt backfillet sortert i originalarket med ID i P.
