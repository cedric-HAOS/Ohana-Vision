# Vision

## Pourquoi Ohana-Vision existe

Une infrastructure fiable ne se résume pas à une succession de services en fonctionnement.

Elle doit être compréhensible.

Au fil du temps, les observations produites par les systèmes deviennent nombreuses, techniques et difficiles à interpréter.

Un serveur répond.

Un service DNS résout un nom.

Une sauvegarde s'exécute.

Un broker MQTT accepte une connexion.

Ces informations sont indispensables, mais elles ne répondent pas à la question essentielle :

> L'infrastructure est-elle capable de fournir les services attendus ?

Ohana-Agent répond à cette question en observant les capacités de l'infrastructure.

Ohana-Vision existe pour rendre cette réponse visible.

Son objectif n'est pas de produire davantage d'informations techniques.

Son objectif est de transformer les observations en une représentation claire, synthétique et exploitable de l'état réel de l'infrastructure.

---

# Notre vision

Nous considérons qu'un système de supervision ne doit pas seulement afficher des métriques.

Il doit raconter l'état de l'infrastructure.

Une personne doit pouvoir ouvrir Ohana-Vision et comprendre immédiatement :

- quelles capacités sont disponibles ;
- lesquelles sont dégradées ;
- depuis quand ;
- pourquoi ;
- quelles conséquences cela entraîne.

L'information doit rester simple même lorsque l'infrastructure devient complexe.

---

# La place d'Ohana-Vision

Ohana-Vision n'observe jamais directement l'infrastructure.

Il ne remplace pas Ohana-Agent.

Il ne dialogue pas avec les équipements.

Il ne réalise aucun diagnostic réseau.

Il reçoit d'Ohana-Agent la définition complète de l'infrastructure ainsi que les observations produites dans le temps.

La définition décrit les nœuds, services, équipements, liaisons et positions logiques. Les observations décrivent leur état réel.

À partir de ces deux contrats, Vision construit une représentation cohérente de l'infrastructure et de son fonctionnement.

Cette séparation garantit que les responsabilités de chaque projet restent parfaitement définies.

---

# Les principes fondamentaux

## La configuration et les observations ont des rôles distincts

Le snapshot d'infrastructure décrit ce qui existe. Il est possédé par Ohana-Agent et remplace atomiquement la définition précédente dans Vision.

Une observation décrit un fait mesuré à un instant donné. Elle n'est ni interprétée ni modifiée lors de son ingestion.

Vision ne maintient aucune seconde copie métier de la configuration de l'Agent.

---

## La santé est calculée

L'état d'une capacité est une information calculée.

Il résulte d'un ensemble d'observations successives.

Une observation ne représente donc pas, à elle seule, la santé d'un service.

---

## Les capacités sont plus importantes que les machines

Une machine peut tomber en panne sans que la capacité disparaisse.

Inversement, plusieurs machines peuvent fonctionner alors que la capacité n'est plus disponible.

Ohana-Vision présente les capacités de l'infrastructure avant les équipements qui les composent.

---

## L'historique est essentiel

Comprendre un incident nécessite de connaître son évolution.

Ohana-Vision conserve l'historique des observations afin de permettre l'analyse des changements d'état dans le temps.

---

## L'interface doit rester lisible

Le rôle d'Ohana-Vision n'est pas d'afficher toutes les données disponibles.

Il est de présenter les informations réellement utiles à la compréhension de l'état de l'infrastructure.

Chaque écran doit privilégier la simplicité, la cohérence et la rapidité de lecture.

---

---

# La topologie pilotée par Agent

Ohana-Agent transmet les équipements, les liaisons et les positions logiques de la topologie.

Les positions sont exprimées sur une grille avec `column` et `row`. Vision reste responsable de la conversion en coordonnées graphiques, du canvas et du responsive.

Avant la première synchronisation, Vision présente un état vide. Les observations ne commencent qu'après acceptation du snapshot complet, ce qui garantit que chaque fait reçu peut être rattaché à une infrastructure connue.

En cas de redémarrage de Vision, l'Agent retransmet périodiquement la configuration et suspend temporairement ses observations jusqu'à la resynchronisation.

# La présence réseau des équipements

Ohana-Agent peut produire une observation légère `network.reachable` pour les
équipements possédant une adresse IPv4 ou un nom DNS. Vision rattache cette observation à la
topologie et affiche un indicateur discret ainsi que les détails de la dernière
vérification.

Cette présence ne remplace pas la santé. Elle complète la lecture de la
topologie sans créer de service artificiel et sans modifier la santé globale.
Vision ne réalise toujours aucun ping ni aucune interrogation réseau directe.

---

# Ce qu'Ohana-Vision n'est pas

Ohana-Vision n'est pas un logiciel de supervision classique.

Il n'est pas un moteur de collecte.

Il n'est pas un ordonnanceur.

Il n'exécute aucun test réseau.

Il n'interroge pas directement les services.

Il ne remplace pas Home Assistant.

Il ne remplace pas Ohana-Agent.

---

# Les objectifs du projet

À terme, Ohana-Vision devra permettre de :

- visualiser l'état global de l'infrastructure ;
- afficher la santé de chaque capacité ;
- consulter l'historique des observations ;
- suivre les changements d'état ;
- comprendre rapidement les causes d'une dégradation ;
- fournir une interface utilisable même lorsque Home Assistant est indisponible.

---

# Notre ambition

Ohana-Agent garantit les capacités de l'infrastructure.

Ohana-Vision les rend visibles.

Ensemble, ils constituent une plateforme capable de mesurer, comprendre et expliquer l'état réel d'une infrastructure domestique.

---

# L'administration de l'infrastructure

Comprendre l'infrastructure est une première étape.

Pouvoir l'administrer depuis la même interface constitue son prolongement naturel.

À terme, Ohana-Vision deviendra également le point d'entrée de l'administration des composants de l'écosystème Ohana.

Selon les capacités exposées par Ohana-Agent et ses plugins, Ohana-Vision pourra notamment permettre :

- consulter les baux DHCP actifs ;
- gérer les réservations DHCP statiques ;
- visualiser les équipements connus ;
- modifier certaines configurations des plugins ;
- installer ou mettre à jour des plugins ;
- consulter les journaux d'exécution ;
- lancer des observations ou des diagnostics à la demande ;
- déclencher certaines actions d'administration.

La version 1.11.3 concrétise également cette architecture pour les sauvegardes
HAOS. La page **Configuration / Plugins / Sauvegardes HAOS** configure les
cibles, leurs adresses et leurs heures quotidiennes, tandis qu'Agent conserve
les secrets, exécute les sauvegardes et décide de la rotation locale après
validation distante.

Ohana-Vision ne réalise pas directement ces opérations.

Il s'appuie sur les API exposées par Ohana-Agent, qui reste le seul responsable de l'exécution des actions sur l'infrastructure.

Cette architecture garantit qu'une même logique métier peut être utilisée aussi bien par l'interface web que par une interface en ligne de commande ou toute autre application.
