![Image](https://github.com/user-attachments/assets/e68b260f-37a1-4a07-919d-be969c52325f)   
  
Helps students stay on top of their assignment deadlines by syncing Canvas assignment events with Google Calendar. The web application presents assignment data in an easy-to-understand format, allowing users to sort, filter, and search assignments. **DueBoard** just ensures you are managing your academic schedules well!
# Features
- [x] **Canvas Calendar Sync:** Automatically sync and read your Canvas calendar events from Google Calendar.
- [x] **Assignment Details:** You can view your assignments with their name, module, description, and countdown until the due date.
- [x] **Sorting & Searching:** Easily sort assignments by their **due date**, **alphabetically**, **urgent only**, or **search** by assignment name or course name based on your criteria.
- [x] **User-Friendly UI:** Built with HTML, CSS, and JavaScript for a responsive experience.
It’s clear and to the point, but you can make it more concise and engaging:  

## Demo  
- **[Short video demo](https://youtu.be/M2U6hr7TV3w?feature=shared)** (as per requirement) - 2-minute video showcasing local use, load balancer access, key features, user interactions and application responses.
- **[More detailed demo]()** (Error Handlling) - Showed how I handled errors like invalid responses or API downtime with clear feedback to the user.
- **[API key restriction demo](https://youtu.be/FpfiYzF_0x0)** (57 seconds) - Restricting and limiting granted API calls to only my domain and its subdomains.

# APIs & Technologies
- **Google Calendar API:**
  - **Official Documentation:** [Google Calendar API Docs](https://developers.google.com/calendar/api/guides/overview)
  - Used for fetching calendar events and assignment data. 
- **Frontend:** HTML, CSS, JavaScript
- **Deployment:** 3 Amazon EC2 servers (web-01, web-02, lb-01), NGINX, HAProxy.

# Local Setup
- **Clone the Repository:**
  - ```bash
    git clone https://github.com/yourusername/DueBoard.git
    cd DueBoard
    ```
- **Configure API and OAuth Credentials:**  
  You'll need to configure a **Google API key** and **OAuth Client ID** for user authentication and access to calendar data.
  - **Obtain Google API and OAuth Credentials:**
    - Go to the [Google Cloud Console](https://console.cloud.google.com/welcome/new?pli=1&inv=1&invt=AbtbzQ), Click "Select Project" and create a new project.
    - Navigate to "APIs & Services" > "Library", search for and enable the "Google Calendar API".  
    - Go to "APIs & Services" > "Credentials", click "Create Credentials" > "API Key", then copy the generated API key.
  - **Get an OAuth Client ID:**
    - In the same Credentials section, click "Create Credentials" > "OAuth Client ID."
    - Set Application type to Web application.
    - Under "Authorized JavaScript origins", add: http://localhost:5500 (must match your local server port). Then click "create and copy the client ID.  
  - **Enable OAuth Consent:**
    - Go to APIs & Services > OAuth consent screen, set up the app name (e.g., "DueBoard") and user support email.
    - Add the scope: https://www.googleapis.com/auth/calendar.readonly, then save.
- **Configure Credentials in config.js**
  - The app imports credentials from `config.js`. Create this file In the project root (where your main JavaScript file is) to store your API key and Client ID. Then add following, replacing the placeholders with your credentials
  
      - ```
        export const CONFIG = {
            client_Id: 'Your_OAuth_client_ID',
            api_key: 'Your_API_Key'
        }
        ```
Go live and open your browser on ```http://localhost:5500``` since port 5500 is the redirect URL in the Google Cloud Console for OAuth. Then follow the instructions displayed on the app.    
# Deployment
I deployed **DueBoard** on two Amazon EC2 web servers (web-01 and web-02) that serve the application via NGINX. I also have a load balancer server (lb-01) mapped to the domain www.chiagoziem.tech via A record which I configured to distributes traffic evenly across web-01 and web-02 using HAProxy.  
### Web Servers Setup
- **NGINX Configuration on web-01 and web-02:**
  - Copied my application files into the home directory of both servers `scp DueBoard/* ubuntu@3.93.240.46:~/`, created my application directory `sudo mkdir -p /var/www/dueboard`, moved the application files into the directory, configured the below server block for my app with the location block for DeuBoard application server pointing to the app directory, saved my configuration and restarted nginx `sudo service nginx restart`
  
      ```
      server {
          listen 80;
          server_name chiagoziem.tech www.chiagoziem.tech;

          rewrite ^/redirect_me https://github.com/Mr-Eke permanent;
          add_header X-Served-By $hostname;
          error_page 404 /404.html;

          location / {
              root /var/www/dueboard;
      
              try_files $uri $uri/ =404;
          }
      }
    ```
# Load Balancer Configuration
My HAProxy-powered load balancer (**lb-01**) distributes incoming traffic evenly between **web-01** and **web-02**. To enable this, I configured`haproxy.cfg` at `/etc/haproxy` with the below settings. ⤵️  
```
frontend eke_front_http
    bind *:80
    mode http
    http-request redirect scheme https code 301

frontend eke_front_secured
    bind *:443 ssl crt /etc/haproxy/certs/www.chiagoziem.tech.pem
    mode http
    http-request set-header X-Forwarded-Proto https
    acl is_non_www hdr(host) -i chiagoziem.tech
    http-request redirect prefix https://www.chiagoziem.tech code 301 if is_non_www
    http-response set-header Strict-Transport-Security "max-age=31536000; includeSubDomains"
    default_backend eke_back

backend eke_back
    mode http
    balance roundrobin
    server 6414-web-01 3.93.240.46:80 check
    server 6414-web-02 54.227.209.123:80 check
```
### Configuration Details:
  - **frontend eke_front_http (Handles unsecured traffic)**:
    - I configured haproxy to listen on port 80 for HTTP traffic and then automatically redirect it to the secure HTTPS version, ensuring users always access the site via the secured domain.  
  - **frontend eke_front_secured:**
    - This block listens on the secured port 443 and handles SSL termination using my domain certificate stored in `/etc/haproxy/certs/www.chiagoziem.tech.pem` from letsEncript.  
    - I also enforced www prefix by redirecting the naked domain (chiagoziem.tech) requests.
    - Added this directive `http-response set-header Strict-Transport-Security "max-age=31536000"` for HAProxy to add the HSTS header to HTTP responses, instructing browsers to enforce HTTPS-only connections for the specified duration (in my case, less than 90 days (countdown to the expiry of my SSL cert from certbot), defined by max-age=31536000)
    - Finally, the backend uses a round-robin algorithm to distribute traffic between web-01 and web-02.
## Validate Load Balancer
The screenshot below shows which web server handles each request. The left image captures a request for the load balancer's IP, while the right image shows one for the domain name. Look at the red arrow, which highlights the `X-Served-By` header and indicates the active server at that moment.
  
![Image](https://github.com/user-attachments/assets/956e88fd-9ea5-4088-a40b-a1c07d7ce9e0)  

# **Handling Sensitive Information (API Key & AOuth Client ID)**  
 My application is entirely client-based and runs in the browser, fully hiding API keys and OAuth client IDs is not possible. But to meet project requirements, I implemented the following measures:  
- **Config file & .gitignore:**
  - I stored API credentials in a `config.js` file and added it to `.gitignore` to prevent them from being pushed to the repository.  
- **API Key Restrictions:**  
  - In Google Cloud Console, I restricted my API key to work only on my application’s domain `https://chiagoziem.tech` and its subdomains `https://*.chiagoziem.tech`, which prevents unauthorized use of the API key from other domains or localhost.  
- **Restricted API Key in Action:**  
  - If an API request originates from a domain that is not authorized, Google blocks it, returning the following 403 PERMISSION_DENIED error:
  
   ```{
        "error": {
          "code": 403,
          "message": "Requests from referer \u003Cempty\u003E are blocked.",
          "status": "PERMISSION_DENIED",
          "details": [
            {
              "@type": "type.googleapis.com/google.rpc.ErrorInfo",
              "reason": "API_KEY_HTTP_REFERRER_BLOCKED",
              "domain": "googleapis.com",
              "metadata": {
                "httpReferrer": "\u003Cempty\u003E",
                "service": "calendar-json.googleapis.com",
                "consumer": "projects/590331090679"
              }
            },
          {
            "@type": "type.googleapis.com/google.rpc.LocalizedMessage",
            "locale": "en-US",
            "message": "Requests from referer \u003Cempty\u003E are blocked."
          }
        ]
      }
    }
    ```
   - **You can watch this [short video](https://youtu.be/FpfiYzF_0x0) (57 seconds) to see how I made the API restriction in Google cloud console.**
# Challanges and how I Overcame them
### Backend with Python/Flask and Redirect URL Confusion
Initially, I was using Python Flask backend to handle Google Calendar API authentication and serve data to frontend. But I got confused when configuring OAuth 2.0 in the Google Cloud Console. I struggled to determine the correct redirect URI, that's the URL Google should redirect users to after they grant consent during the OAuth flow. I wasn’t sure whether it should point to the Flask backend or the frontend, and I couldn’t get it work.
#### **Solution:**  
I decided to pivot entirely to a client-side application using the Google API Client Library (gapi) and Google Identity Services (GIS). There was no need for a backend server anymore and the redirect URI confusion. authentication happens directly in the browser via google.accounts.oauth2.initTokenClient (see `gisLoaded()` function), and the redirect URI is implicitly handled by Google’s client-side OAuth flow.
  
### Date and Time Mismatch with Google Calendar Events    
When fetching assignment events from Canvas via the Google Calendar API, I noticed a difference between `date.dateTime` and `date.date`:  
- `date.dateTime` provides a full timestamp (e.g., `2025-04-01T23:59:00+02:00`), which correctly aligns with the expected deadline in Central Africa Time (CAT, UTC+2).  
- `date.date` only contains a date (e.g., `2025-04-02`), representing an all-day event that technically ends at midnight (`00:00 CAT`). But most Canvas assignments are typically due at 11:59 PM the previous day, making the default behavior misleading.  
This caused issues in displaying due dates and calculating time remaining, as assignments set to `date.date` would appear as being due a day later than intended.  

#### **Solution:**  
I later figured it out and implemented a logic in `listUpcomingEvents()` to handle both cases correctly:  
- If `dateTime` exists, it is directly used as the due date (`new Date(event.end.dateTime)`).  
- If only `date` is available, I parse it, create a `Date` object, and subtract one minute (`dueDate.setMinutes(dueDate.getMinutes() - 1)`) to shift it from `00:00` (midnight) to `23:59` (11:59 PM) on the previous day.  

##### **Code Implementation:**  
```javascript
let dueDate;
if (event.end.date && !event.end.dateTime) {
    const [year, month, day] = event.end.date.split('-');
    dueDate = new Date(year, month - 1, day);
    dueDate.setMinutes(dueDate.getMinutes() - 1); // Adjust to 11:59 PM previous day
} else {
    dueDate = new Date(event.end.dateTime); // Use full timestamp
}
```
The adjustment now ensured that assignments with `date` were displayed with the correct deadline of 11:59 PM instead of midnight, my `getDaysUntil()` function now correctly determines the number of days left until an assignment is due, preventing off-by-one errors and assignments now show as "Due today" at the right time instead of appearing a day later.  
  
  

