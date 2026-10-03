# Lire les priorités Tsunade

Les incidents actifs sont classés selon leur priorité et leur prochaine étape.
Chaque carte montre le constat, la conclusion Tsunade, sa confiance lorsqu’elle
est disponible et la fraîcheur des éléments analysés. Une conclusion antérieure
à de nouveaux journaux reste explicitement datée. Le nombre total d’anomalies
est distingué des huit exemples présentés.

« Voir le dossier » ouvre les journaux, hypothèses, décisions, propositions et
événements. Une demande explicite de diagnostic conserve l’intention de
l’opérateur jusqu’à Agent.

## Parcours, preuves et réparation

Depuis Vision 1.36.0, le dossier présente les étapes datées et leur provenance
déclarée par Agent. Il rassemble les faits, les hypothèses et leurs contradictions,
les lacunes de confirmation et les investigations non abouties. Une origine
absente reste inconnue. Le nombre de lignes de journaux correspondantes est
distinct du nombre d'anomalies ; une collecte tronquée ou vide ne suffit pas à
conclure une résolution.

Les investigations donnent accès aux preuves structurées. Chaque réparation
sépare proposition, autorisation ou refus, report, exécution et vérification.
Une proposition ne prouve pas une exécution ; seule une réparation `succeeded`
est présentée comme vérifiée avec succès. L'état courant reste fourni par Agent,
y compris lorsque le dossier en cache contient une ancienne décision.

## Disposition de la page

Sur écran large, la page Tsunade a deux colonnes qui défilent chacune de leur
côté : à gauche les incidents (filtres avec leurs compteurs et « Contrôler les
journaux » figés en haut), à droite la surveillance en quatre onglets.
Un bandeau d’une ligne donne le nombre de dérives à surveiller et l’heure du
dernier contrôle des journaux. Sous 1000 px, une seule colonne et un seul
défilement. L’onglet choisi est retenu pour la session.

| Onglet | Contenu |
| --- | --- |
| À surveiller | synthèse préventive, dérives (avec dépendances déclarées et incident amont), règles appliquées (une ligne par règle, critère au clic), rattrapage de l’historique |
| Journaux | par source, les composants (Tapo, Kasa, Shelly...) avec occurrences et gravité, « Accepter » ou « Compter à nouveau », anomalies acceptées |
| Réparations connues | réparations classées par fiabilité (`#1`, fiable, instable...), désactivation, obsolescence |
| Bilan | contrôles de journaux, réparations connues, taux de réussite et statistiques détaillées (7 jours, 30 jours, depuis le début ; par réparation et par équipement) |

Le dossier d’un incident de journaux groupe ses anomalies par composant, toutes
présentées, avec « Accepter <composant> ».

Shizune affiche l’essentiel et permet d’ouvrir le dossier Vision de l’incident,
ou de demander un diagnostic via la passerelle compagnon authentifiée. Une
absence d’autorisation en attente ne signifie pas absence d’incident.

## Équipements retirés

L’« État courant » ne contient que les équipements déclarés dans la topologie
actuelle. L’affichage est recalculé après rechargement de celle-ci. Les périodes
des équipements supprimés restent dans l’historique. Agent clôture séparément
leurs incidents réseau persistés au démarrage et à l’enregistrement de
l’architecture : aucune purge d’historique n’est nécessaire.

## Compatibilité et validation

La synthèse complète nécessite Agent 1.26.16 ; Vision garde la lecture des
décisions historiques. Le nouveau parcours compagnon nécessite Shizune 0.2.3.
Les tests couvrent le pont authentifié et le rendu statique. Les pages desktop
et mobile 390 px ont été contrôlées localement avec des données représentatives.
Ces contrôles ne remplacent pas la vérification sur INFRA-01 après déploiement.
