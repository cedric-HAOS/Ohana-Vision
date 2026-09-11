# Lire les priorités Tsunade

Les incidents actifs sont classés selon leur priorité et leur prochaine étape.
Chaque carte montre le constat, la conclusion Tsunade, sa confiance lorsqu’elle
est disponible et la fraîcheur des éléments analysés. Une conclusion antérieure
à de nouveaux journaux reste explicitement datée. Le nombre total d’anomalies
est distingué des huit exemples présentés.

« Voir le dossier » ouvre les journaux, hypothèses, décisions, propositions et
événements. Les statistiques et contrôles de journaux sont repliables. Une demande
explicite de diagnostic conserve l’intention de l’opérateur jusqu’à Agent.

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
