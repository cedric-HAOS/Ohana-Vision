# Observation Model

## Objectif

Les observations constituent le langage commun entre Ohana-Agent et Ohana-Vision.

Elles représentent des faits mesurés sur l'infrastructure.

Une observation n'est jamais une interprétation.

Elle décrit uniquement ce qui a été observé à un instant donné.

---

# Une observation est un fait

Exemple :

> Le serveur DNS **dns-primary** a résolu **example.com** en **3,8 ms**.

Ceci est une observation.

En revanche :

> Le DNS est fiable.

Ceci est une interprétation.

Ohana-Vision construit ses représentations à partir des observations, mais ne modifie jamais leur signification.

---

# Cycle de vie

```text
Infrastructure
      │
      ▼
Plugin Ohana-Agent
      │
      ▼
Observation
      │
      ▼
Transport
      │
      ▼
Ohana-Vision
      │
      ├── Historique
      ├── Etat courant
      └── Tableau de bord
```

---

# Structure logique

Une observation décrit :

* son origine ;
* la date de l'observation ;
* le nœud concerné ;
* le service concerné ;
* la capacité observée ;
* le résultat ;
* le statut ;
* le message ;
* les métadonnées associées.

---

# Les différents niveaux

## Observation

Une observation correspond à une mesure unique.

Elle est immuable.

---

## État courant

L'état courant est calculé à partir de la dernière observation pertinente.

Il peut évoluer sans que les observations passées soient modifiées.

---

## Historique

L'historique est la succession chronologique des observations.

Il permet de reconstruire l'évolution de l'infrastructure.

---

# Observations de service et d’équipement

La majorité des observations décrivent une capacité fournie par un service.
Elles alimentent l’état courant, la timeline et la santé globale.

Certaines observations décrivent uniquement un équipement de topologie. Elles
sont identifiées par la métadonnée suivante :

```yaml
target_type: device
```

C’est notamment le cas de `network.reachable`. Ces observations restent des
faits immuables, conservés et affichables, mais elles ne représentent pas la
santé fonctionnelle d’un service. Vision les exclut donc volontairement de
l’agrégation de santé.

La métadonnée `device_id` permet de rattacher le fait à l’équipement déclaré
dans le snapshot d’infrastructure.

---

# Observation et capacité

Une capacité peut produire de nombreuses observations.

Exemple :

```text
Capacité : DNS

08:00 Healthy
08:05 Healthy
08:10 Healthy
08:15 Degraded
08:20 Healthy
```

La capacité reste une seule entité.

Les observations décrivent son évolution.

---

# Observation et service

Un service peut produire plusieurs capacités.

Exemple :

```text
dns-primary

├── Résolution DNS
├── Temps de réponse
├── Disponibilité
└── Cohérence de configuration
```

Chaque capacité génère ses propres observations.

---

# Métadonnées

Les métadonnées permettent aux plugins d'ajouter des informations spécifiques.

Exemples :

* adresse IP résolue ;
* durée ;
* code de retour ;
* version logicielle ;
* nombre de baux DHCP ;
* taille d'une sauvegarde.

Ohana-Vision ne doit pas imposer une structure fixe aux métadonnées.

---

# États

Une observation peut indiquer différents statuts.

Par exemple :

* Healthy
* Degraded
* Unavailable
* Unknown

Les statuts exacts sont définis par les contrats communs avec Ohana-Agent.

---

# Immutabilité

Une observation ne doit jamais être modifiée après sa création.

Si une nouvelle mesure est réalisée, une nouvelle observation est produite.

Cette règle garantit :

* la traçabilité ;
* l'audit ;
* la reproductibilité des analyses.

---

# Agrégation

Ohana-Vision peut agréger les observations pour produire :

* un état courant ;
* des graphiques ;
* des tendances ;
* des statistiques ;
* des incidents ;
* une santé globale.

Ces agrégations ne remplacent jamais les observations originales.

---

# Compatibilité

Le format des observations constitue un contrat partagé entre Ohana-Agent et Ohana-Vision.

Toute évolution incompatible devra être versionnée.

L'objectif est de permettre à plusieurs versions de Ohana-Agent et Ohana-Vision de coexister pendant une période de transition, sans compromettre la stabilité de l'écosystème.
