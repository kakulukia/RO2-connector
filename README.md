# RO-Bot

Der RedOne (RO) Teams Bot kann sowohl Alarme in einen Teams-Kanal senden als auch die Rückantwort (Annahme / Erledigung der Alarme) mit RedOne abgleichen.

## Installation

- Python
- Redis
- Node

Eine Abhängigkeit des Projekts ist Node-Gyp, welches wiederum Python für die Installation benötigt (https://www.python.org/downloads/).
Des Weiteren wird Redis als Datenbank verwendet. Redis kann über die gängigen Paketmanager installiert oder [hier heruntergeladen](https://redis.io/download) werden.

Node Version v14.16.0 oder höher sollte installiert sein.
Für die Kapselung vom restlichen System, empfehlen wir n, ein Manager für verschiedene, gleichzeitig installierte Node-Versionen.

Der Bot wurde mit den Node Versionen v14.16.0 LTS und v15.10.0 getestet.

https://github.com/mklement0/n-install

Danach kann via `n install 15.10.0` die benötigte Version installiert werden, ohne vorher durch den Paketmanager des System eine veraltete Version installieren zu müssen.

Um die Abhängigkeiten des RO-Bots zu installieren, bitte im Projektverzeichnis folgendes Kommando ausführen:

```bash
npm install
```

Nach erfolgreicher Installation lässt sich der RO-Bot mit folgendem Befehl starten:

```bash
npm start
```

## RO-Bot als Dienst

Um den RO-Bot als Dienst laufen zu lassen, empfehlen wir pm2. Eine ausführliche Doku zu pm2 gibt es [hier](https://pm2.keymetrics.io/docs/usage/pm2-doc-single-page/).

PM2 kümmer sich zuverlässig um Autostart, Neustart bei Absturz des Bots sowie Logging und eine Ansicht zur Ressourcenauslatung.

```bash
pm2 start index.js --name "RedOne Teams Bot"
```

## Hinzufügen des RedOne Teams Bots zur eigenen Teams-Umgebung

Voraussetzungen hierfür:

1. [Visual Studio Code](https://code.visualstudio.com/Download)
2. VS Code Plugin: [Microsoft Teams Toolkit](https://marketplace.visualstudio.com/items?itemName=TeamsDevApp.ms-teams-vscode-extension)

Das Plugin erzeugt ein neues Icon für Microsoft Teams in der Linken Navigationsleiste von VS Code.
Die folgenden Anweisungen beziehen sich auf die Inhalte des neuen MS Teams Menüpunkts.

1. "Create a new Teams app"
2. Name: "RedOne Teams Bot"
3. "Create a new app" auswählen und bestätigen
4. Es werden nun die AppID und ein Passwort generiert. Beides gehört in die Datei `.env` des Projekts.
5. Der nächste Schritt (Auswahl eines Projektordners) kann übersprungen werden
6. Über die Menüpunkte "Open Microsoft Teams Toolkit" >> "Bots" >> "Existing bot registrations" können die weiteren Details des Bots bearbeitet werden. Bitte den eben erstellten Bot auswählen und dann in "Bot endpoint address" die öffentlich erreichbare HTTPS-Adresse des Bots eintragen. Die Adresse muss dabei folgendem Format entsprechen: `https://<domain>/api/messages`
   (für Tests kann das Tool [ngrok](https://ngrok.com/) genutzt werden, dass einen beliebigen lokalen Port öffenlich verfügbar machen kann)
7. Über den Menüpunkt "Download publishing package" bitte die Zip-Datei herunterladen.
8. In Teams links unten unter "Apps" nach unten scrollen. Mit der passenden Berechtigung, gibt es dort den Manüpunkt "Benutzerdefinierte App hochladen". Nach einem Klick darauf, erscheint der Punkt "Für <Organisation> hochladen".
9. Hier bitte das soeben runtergeladene App-Manifest hochladen und damit für die eigene Organisation zur Verfügung stellen.
10. Der Bot kann anschließend zu den gewünschten Teams hinzugefügt werden.

Beim hinzufügen existiert zwar die Möglichkeit, den Bot direkt bei bestimmten Kanälen eines Teams hinzuzufügen. Diese Funktion ist aber von MS noch nicht richtig implementiert, sodass der Bot immer in den Kanal "Allgemein" eingeladen wird.
Anschließend kann über eine Nachricht im gewünschten Kanal der Bot für eben diesen registriert werden. Der Bot muss direkt angesprochen werden, damit Teams die Nachricht an ihn sendet.

Die benötigte Nachricht lautet zur Registrierung des Kanals lautet: "@<Botname> add".
Der Bot wird diese Nachricht bestätigen und dabei die ID des Kanals mit ausgeben, welche für den RedOne benötigt wird.
