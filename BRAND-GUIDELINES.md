# Charte graphique Ohana

## 1. Positionnement

Ohana représente une infrastructure observable, résiliente et pilotée par capacités.
L’identité visuelle associe un cercle continu, des circuits et des nœuds interconnectés.

## 2. Logo

Le symbole principal est un cercle réseau composé de pistes électroniques et de trois nœuds.
Le mot-symbole « Ohana » utilise une typographie sans serif moderne et sobre.

### Variantes

- `logo-dark.svg` : fond sombre, texte clair.
- `logo-light.svg` : fond clair, texte sombre.
- `logo.svg` : variante générique.
- `favicon.svg` : symbole seul.
- `favicon.ico` : compatibilité navigateurs.
- `apple-touch-icon.png` : raccourci iOS.
- `icon-192.png` et `icon-512.png` : PWA.

### Zone de protection

Conserver autour du logo un espace libre au moins égal à 25 % de la hauteur du symbole.
Ne pas étirer, incliner, recolorer ou ajouter d’effets au logo.

## 3. Palette et source de référence

Les couleurs effectivement chargées sont les tokens de
[`design-system.css`](src/ohana_vision/web/static/design-system.css). Le
[référentiel Platform](https://github.com/cedric-HAOS/Ohana-Platform/blob/main/docs/Design/Colors.md)
documente la même palette. La précédente palette cyan de cette charte est
historique ; elle ne prescrit plus les valeurs de l'interface.

| Usage | Token | Valeur |
|---|---|---|
| Fond général | `--ohana-background-canvas` | `#071014` |
| Sidebar | `--ohana-background-sidebar` | `#091419` |
| Surface | `--ohana-background-surface` | `#0d1a20` |
| Surface élevée | `--ohana-background-surface-raised` | `#112229` |
| Accent principal | `--ohana-brand-primary` | `#28d7c0` |
| Accent survolé | `--ohana-brand-primary-hover` | `#4de0cd` |
| Accent actif | `--ohana-brand-primary-active` | `#20bda9` |
| Texte principal | `--ohana-text-primary` | `#f1f7f7` |
| Texte secondaire | `--ohana-text-secondary` | `#a9b9bc` |
| Texte atténué | `--ohana-text-muted` | `#718489` |
| Bordure | `--ohana-border-default` | `#294149` |
| Sain | `--ohana-health-healthy` | `#28d7c0` |
| Dégradé | `--ohana-health-degraded` | `#f2b84b` |
| Critique | `--ohana-health-critical` | `#ef6464` |
| Inconnu | `--ohana-health-unknown` | `#718489` |

## 4. Typographie

Police recommandée : `Inter`.
Alternative système : `Segoe UI`, `Arial`, sans-serif.

- Titres : 600 à 700.
- Corps : 400 à 500.
- Données et métriques : 500 à 600.
- Éviter les capitales intégrales hors libellés très courts.

## 5. Interface

Réutiliser les tokens `--ohana-background-*`, `--ohana-text-*`,
`--ohana-brand-*` et `--ohana-health-*`. Les alias de
[`foundations.css`](src/ohana_vision/web/static/styles/foundations.css)
conservent les composants historiques compatibles avec ces mêmes valeurs.
Associer couleur, icône et libellé ; vérifier le contraste pour chaque état.
Le rayon et les espacements sont définis par les tokens du Design System.

## 6. Intégration HTML

```html
<link rel="icon" href="/ui/favicon.ico" sizes="any">
<link rel="icon" href="/ui/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/ui/apple-touch-icon.png">
<link rel="manifest" href="/ui/site.webmanifest">
<meta name="theme-color" content="#071014">
```

## 7. Packaging Python

Ajouter les motifs suivants à `pyproject.toml` :

```toml
[tool.setuptools.package-data]
ohana_vision = [
    "web/static/*.html",
    "web/static/*.css",
    "web/static/*.js",
    "web/static/*.ico",
    "web/static/*.svg",
    "web/static/*.png",
    "web/static/*.webmanifest",
    "web/static/styles/*.css",
]
```
