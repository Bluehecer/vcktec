#include <Arduino.h>

#include <WiFi.h>

#include <HTTPClient.h>

#include <ArduinoJson.h>

// Gemini API key - replace with your key

const char* apiKey = "YOUR_GEMINI_API_KEY";

// WiFi credentials

const char* ssid = "YOUR_SSID";

const char* password = "YOUR_PASSWORD";

String generateContent(String prompt) {

  HTTPClient http;

  String url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=" + String(apiKey);

  http.begin(url);

  http.addHeader("Content-Type", "application/json");

  // Create JSON payload

  DynamicJsonDocument doc(1024);

  doc["contents"][0]["parts"][0]["text"] = prompt;

  String jsonString;

  serializeJson(doc, jsonString);

  int httpResponseCode = http.POST(jsonString);

  if (httpResponseCode > 0) {

    String response = http.getString();

    // Parse response

    DynamicJsonDocument respDoc(2048);

    deserializeJson(respDoc, response);

    String text = respDoc["candidates"][0]["content"]["parts"][0]["text"];

    http.end();

    return text;

  } else {

    http.end();

    return "Error: " + String(httpResponseCode);

  }

}

void setup() {

  Serial.begin(115200);

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {

    delay(1000);

  }

  Serial.println("Connected to WiFi");

  Serial.println("Enter text to send to Gemini:");

}

void loop() {

  if (Serial.available()) {

    String input = Serial.readStringUntil('\n');

    input.trim();

    if (input.length() > 0) {

      Serial.println("Sending to Gemini: " + input);

      String response = generateContent(input);

      Serial.println("Gemini response: " + response);

      // TODO: Convert response to speech and play on speaker

    }

  }

  delay(100);

}