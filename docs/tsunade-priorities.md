# Lire les priorités Tsunade

Les incidents sont présentés dans un tableau de triage, une ligne par incident :
équipement et problème suivi (avec gravité et état), cause probable et
certitude, action, date d’ouverture et durée. Les incidents actifs viennent en
premier, classés selon leur priorité, puis les plus récents.

- **Problème** : le service ou le contrôle surveillé, jamais le dernier message,
  qui décrit le retour à la normale une fois l’incident résolu.
- **Cause probable** : l’interprétation propre à l’incident
  (`latest_decision.interpretation`), à défaut la conclusion. « Conclusion à
  actualiser » signale une observation plus récente que la décision.
- **Certitude** : `diagnostic_level` (Confirmée, Probable, Contexte insuffisant)
  et la confiance. Le libellé porte l’information, la couleur l’accompagne.
- **Action** : une réparation en attente d’autorisation (« À autoriser ») ou une
  demande à examiner dans Shizune passent avant la suite recommandée ; pour un
  incident résolu, la dernière réparation et son issue.

La recherche ignore accents et majuscules ; chaque mot doit apparaître dans
l’équipement, le problème, le message, le symptôme d’ouverture
(`opening_message`), la cause, l’action ou le jour. Le tableau
se regroupe par équipement, gravité ou jour (choix retenu pour la session), en
plus des filtres d’état. La liste charge les 100 derniers incidents ; en bas du
tableau, « Charger les 100 incidents résolus plus anciens » remonte l’historique
page par page (Agent avec `/v1/incidents/{id}/older`), et la ligne indique combien
d’incidents sont chargés sur le total. La recherche porte sur les incidents
chargés.

Choisir une ligne affiche à droite la carte de l’incident et ouvre son dossier :
journaux, hypothèses, décisions, propositions et événements, avec les mêmes
boutons qu’avant (autoriser, refuser, analyser, « J’ai corrigé
manuellement »...). Les flèches parcourent les lignes, Entrée ouvre la ligne
choisie. Une demande explicite de diagnostic conserve l’intention de
l’opérateur jusqu’à Agent. Une conclusion antérieure à de nouveaux journaux reste
explicitement datée, et le nombre total d’anomalies est distingué des huit
exemples présentés.

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

La page Tsunade a cinq onglets ; « Contrôler les journaux » reste à droite des
onglets, accessible depuis chacun. Un bandeau d’une ligne donne le nombre de
dérives à surveiller et l’heure du dernier contrôle des journaux. L’onglet
choisi est retenu pour la session.

Sur écran large, l’onglet Incidents a deux zones qui défilent chacune de leur
côté : le tableau à gauche (filtres, recherche et regroupement figés au-dessus),
la carte et le dossier de l’incident choisi à droite. Sous 1000 px, le dossier
passe sous le tableau. Aucune présentation téléphone n’est prévue : Shizune
sert sur iPhone.

| Onglet | Contenu |
| --- | --- |
| Incidents | tableau de triage et dossier de l’incident choisi |
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
