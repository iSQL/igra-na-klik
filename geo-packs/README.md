# Geo-paketi za "Pogodi gde je"

Svaki paket je `<id>.json` manifest plus folder `<id>/` sa slikama. Server
ih čita iz ovog direktorijuma (override-uj sa env varijablom `GEO_PACKS_DIR`),
serve-uje JPEG/PNG fajlove na `/geo-images/<id>/<file>`, i listu paketa na
`/api/geo-packs`.

## Struktura

```
geo-packs/
├── README.md                  (ovaj fajl)
├── branicevski.json           (manifest)
└── branicevski/
    ├── viminacium.jpg
    └── lepenski-vir.jpg
```

## Format manifest-a

```json
{
  "name": "Braničevski okrug",
  "description": "Lokacije iz Braničevskog okruga",
  "locations": [
    {
      "imageFile": "viminacium.jpg",
      "lat": 44.7414,
      "lng": 21.2287,
      "district": "branicevski",
      "caption": "Viminacium, antički grad"
    }
  ]
}
```

### Polja

| Polje         | Tip            | Obavezno | Napomena                                                                                       |
| ------------- | -------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `name`        | string         | ✓        | Prikazuje se u game-select dropdown-u i tokom intro faze.                                      |
| `description` | string         |          | Slobodan opis paketa.                                                                          |
| `locations`   | array          | ✓        | 1–100 stavki.                                                                                  |
| `imageFile`   | string         | ✓        | Relativna putanja unutar `geo-packs/<id>/`. Bez `..`.                                          |
| `lat`         | broj           | ✓        | 41.5 ≤ lat ≤ 46.5                                                                              |
| `lng`         | broj           | ✓        | 18.5 ≤ lng ≤ 23.5                                                                              |
| `district`    | enum           |          | Vidi listu okruga niže. Trenutno samo metadata; v2 može da daje bonus za pogađanje okruga.     |
| `caption`     | string ≤ 200   |          | Prikazuje se nakon otkrivanja.                                                                 |

### Validni okruzi (`district`)

```
severnobacki     srednjebanatski    severnobanatski   juznobanatski
zapadnobacki     juznobacki         sremski           macvanski
kolubarski       podunavski         branicevski       sumadijski
pomoravski       borski             zajecarski        zlatiborski
moravicki        raski              rasinski          niski
toplicki         pirotski           jablanicki        pcinjski
beograd
```

## Dodavanje novog paketa

1. Ubaci JPEG/PNG slike u `geo-packs/<id>/`. Slike trebaju biti u landscape
   ili portrait — host ih renderuje sa `object-fit: contain`. Idealno
   ~1080–1600 px na duljoj strani; veće slike sporije se serve-uju.
2. Napravi `geo-packs/<id>.json` po formatu iznad.
3. Restart-uj server (`npm run dev:server`). Paket se odmah prikazuje u
   host-ovom select-u.

## Mod sa slikama igrača (custom)

Custom mod ne koristi ovaj direktorijum — igrači uploaduju sa telefona,
slike žive u memoriji servera dok igra traje. Za njega ne treba ništa
podešavati.
