import requests
import time
import os

API_KEY = os.getenv("OPENROUTER_API_KEY")  # Replace with your actual key
ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "openrouter/free" # Using a free model for the test

MAX_REQUESTS = 3
DELAY_BETWEEN_REQUESTS = 4  # Seconds to wait (safely under 20 requests/minute)

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
    # OpenRouter optionally requests these to rank your app on their site, 
    # but they are good practice to include:
    "HTTP-Referer": "https://test-script.local", 
    "X-Title": "API Key Tester"
}

payload = {
    "model": MODEL,
    "messages": [
        {"role": "user", "content": "Reply with the single word 'Success' if you can read this."}
    ]
}

print(f"Testing OpenRouter API key (Max {MAX_REQUESTS} requests)...")
print("-" * 40)

for attempt in range(1, MAX_REQUESTS + 1):
    print(f"Attempt {attempt} of {MAX_REQUESTS}...")
    
    try:
        response = requests.post(ENDPOINT, headers=headers, json=payload)
        
        # If it's a 200 OK, the key works!
        if response.status_code == 200:
            data = response.json()
            reply = data['choices'][0]['message']['content']
            print(f"✅ Success! API returned: {reply.strip()}")
            break # Exit the loop, we proved it works
            
        # If we hit a rate limit
        elif response.status_code == 429:
            print("⚠️ 429 Error: You hit the rate limit. Waiting for the penalty to clear...")
            
        # If the key is invalid or out of credits
        elif response.status_code in [401, 402, 403]:
            print(f"❌ {response.status_code} Auth/Billing Error!")
            print(f"Details: {response.text}")
            break # No point in retrying a bad key
            
        # Any other error (bad request, server error, etc.)
        else:
            print(f"❌ HTTP {response.status_code} Error: {response.text}")
            
    except Exception as e:
        print(f"🚨 Network or code error: {e}")
        break

    # If we didn't succeed and it's not our last try, wait before the next attempt
    if attempt < MAX_REQUESTS:
        print(f"Waiting {DELAY_BETWEEN_REQUESTS} seconds before next attempt to respect rate limits...\n")
        time.sleep(DELAY_BETWEEN_REQUESTS)

print("-" * 40)
print("Test complete.")