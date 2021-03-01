# RO-Bot

Der RedOne (RO) Teams Bot kann sowohl Alarme in einen Teams-Kanal senden als auch die Rückantwort (Annahme / Erledigung der Alarme) mit RedOne abgleichen.

## Installation

Node version v15.10.0 oder höher sollte installiert sein.
Für die Kapselung vom restlichen System, empfelhen wir n, ein Managr für verschiedene, gleichzeitig installierte Node-Versionen.

https://github.com/mklement0/n-install

Danach kann via `n install 15.10.0` die benötigte Version installiert werden, ohne vorher durch den Paketmanager des System eine veraltete Version installieren zu müssen.

Up die Abhängigkeiten des RO-Bots zu installieren, bitte im Projektverzeichnis folgendes Kommando ausführen:

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
