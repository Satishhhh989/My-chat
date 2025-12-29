# OurSpace: Zero-Knowledge Secure Chat

> A real-time, end-to-end encrypted messaging platform built with React & Firebase.
> Messages are encrypted on your device before they ever touch the cloud.

[React] [Firebase] [Encryption: AES-GCM]

---

## Overview

OurSpace is a web-based secure communication tool designed on a Zero-Knowledge Architecture. Unlike standard chat apps where the server (and database admins) can read your messages, OurSpace performs all cryptographic operations client-side using the native Web Crypto API.

The server (Firebase) acts only as a blind data store. It receives encrypted blobs and has absolutely no access to the keys required to decrypt them.

## Security Architecture (The Core)

This project does not rely on third-party encryption libraries. It implements the NIST-standard cryptographic stack manually for maximum transparency and control.

### The Stack

| Component | Technology | Description |
| :--- | :--- | :--- |
| Encryption Algorithm | AES-GCM (256-bit) | Military-grade authenticated encryption. Ensures both confidentiality and integrity. |
| Key Derivation | PBKDF2 | Uses 100,000 iterations of SHA-256 to derive strong keys from user passwords. |
| Addressing | SHA-256 Hash | Room locations are hashed. The database key is mathematically unrelated to the encryption key. |
| Randomness | CSPRNG | Uses the browser's crypto generator for IVs (Initialization Vectors) so no two identical messages look the same. |

### Two-Factor Access Model (V2 Update)

To prevent "Rainbow Table" attacks on Room IDs, the system separates the Address from the Key:

1.  Room Code (Public): Tells the app where to fetch data.
2.  Secret Key (Private): Tells the app how to decrypt that data.

Even if a hacker finds the room, they see only scrambled nonsense without the second key.

---

## Features

* **End-to-End Encryption:** Text and Images are encrypted locally.
* **Privacy Blur:** The interface automatically blurs when you switch tabs or minimize the window to prevent shoulder surfing.
* **Native Image Compression:** Custom canvas-based compression engine to optimize encrypted payloads.
* **Real-Time Sync:** Instant message delivery using Firestore listeners.
* **Anonymous Auth:** No email or phone required. Temporary sessions.

---

## Tech Stack

* **Frontend:** React.js (Next.js App Router compatible)
* **Styling:** Tailwind CSS + Framer Motion
* **Backend:** Firebase Firestore (NoSQL Database)
* **Auth:** Firebase Authentication (Anonymous)
* **Icons:** Lucide React

---

## Getting Started

### Prerequisites

* Node.js installed
* A Firebase Project (Free Tier)

### Installation

1.  Clone the repo
    ```bash
    git clone [https://github.com/Satishhhh989/My-chat.git](https://github.com/Satishhhh989/My-chat.git)
    cd My-chat
    ```

2.  Install dependencies
    ```bash
    npm install firebase framer-motion lucide-react date-fns
    ```

3.  Configure Firebase
    * Create a project at the Firebase Console.
    * Enable Firestore Database and Authentication (Anonymous).
    * Replace the firebaseConfig object in OurSpace.js with your own keys.

4.  Run the app
    ```bash
    npm run dev
    ```

---

## How to Use

1.  **Enter Identity:** Pick a display name.
2.  **Set Room Code:** Choose a public identifier or generate a random one. Share this with your partner.
3.  **Set Secret Key:** Choose a strong password. Do not share this over the internet.
4.  **Chat:** Once both users are in the same Room Code with the same Secret Key, the locked messages will decrypt into real text.

---

## Disclaimer

This project is for educational purposes. While it uses standard cryptographic algorithms, it has not been audited by a third-party security firm. Use with discretion.

---

Made by Satsh
