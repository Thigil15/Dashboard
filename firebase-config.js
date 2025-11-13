// Firebase Configuration
// This configuration is for the project "dashboardalunos"
// 
// IMPORTANT: Update these values with your actual Firebase project configuration
// You can find these values in the Firebase Console:
// 1. Go to Project Settings
// 2. Scroll down to "Your apps" section
// 3. Click on the web app (or create one if needed)
// 4. Copy the firebaseConfig object
//
// The databaseURL is already correct based on CodeFirebase.gs
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCR3gZuiUUC-IMHduSGSuWWnFyn2sNYOEQ",
  authDomain: "dashboardalunos.firebaseapp.com",
  databaseURL: "https://dashboardalunos-default-rtdb.firebaseio.com",
  projectId: "dashboardalunos",
  storageBucket: "dashboardalunos.firebasestorage.app",
  messagingSenderId: "897767302445",
  appId: "1:897767302445:web:61dc5f0c3419ac680adfa4"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
