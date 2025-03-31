![Image](https://github.com/user-attachments/assets/e68b260f-37a1-4a07-919d-be969c52325f)   
  
Helps students stay on top of their assignment deadlines by syncing Canvas assignment events with Google Calendar. The web application presents assignment data in an easy-to-understand format, allowing users to sort, filter, and search assignments. **DueBoard** just ensures you are managing your academic schedules well!
## Features
- [x] **Canvas Calendar Sync:** Automatically sync and read your Canvas calendar events from Google Calendar.
- [x] **Assignment Details:** You can view your assignments with their name, module, description, and countdown until the due date.
- [x] **Sorting & Searching:** Easily sort assignments by their **due date**, **alphabetically**, **urgent only**, or **search** by assignment name or course name based on your criteria.
- [x] **User-Friendly UI:** Built with HTML, CSS, and JavaScript for a responsive experience.
## APIs & Technologies
- **Google Calendar API:**
  - **Official Documentation:** [Google Calendar API Docs](https://developers.google.com/calendar/api/guides/overview)
  - Used for fetching calendar events and assignment data. 
- **Frontend:** HTML, CSS, JavaScript
- **Deployment:** 3 Amazon EC2 servers (web-01, web-02, lb-01), NGINX, HAProxy.

## Local Setup
- **Clone the Repository:**
  - ```bash
    git clone https://github.com/yourusername/DueBoard.git
    cd DueBoard
    ```
- **Configure API and OAuth Credentials:**  
  **DueBoard** fetches assignments from your Canvas calendar via the Google Calendar API, which requires an API key and an OAuth 2.0 Client ID. So you'll need to configure a **Google API key** and **OAuth Client ID** to authenticate and access calendar data.
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
  - The app imports credentials from `config.js`. Create this file In the project root (where your main JavaScript file is) to store your API key and Client ID.  
  - Add the following, replacing the placeholders with your credentials  
      - ```
        export const CONFIG = {
            client_Id: 'Your_OAuth_client_ID',
            api_key: 'Your_API_Key'
        }
        ```
Go live and open your browser on ```http://localhost:5500``` since port 5500 is the redirect URL in the Google Cloud Console for OAuth. Then follow the instructions displayed on the app.    
## Deployment
I deployed **DueBoard** on two Amazon EC2 web servers (web-01 and web-02) that serve the application via NGINX. Then I have a load balancer server (lb-01) mapped to the domain www.chiagoziem.tech via A record which I configured to distributes traffic evenly across web-01 and web-02 using HAProxy.  
#### Web Servers Setup
- **NGINX Configuration on web-01 and web-02:**
  - Plced My application files in this directory ```/var/www/dueboard``` and below is a server block I configured on Nginx to serve requests for dueboard app
      ```
      server {
          listen 80;
          server_name chiagoziem.tech www.chiagoziem.tech;

          rewrite ^/redirect_me https://github.com/Mr-Eke permanent;
          add_header X-Served-By 6414-web-01;
          error_page 404 /404.html;

          location / {
              root /var/www/dueboard;
      
              try_files $uri $uri/ =404;
          }
      }
    ```
## Load Balancer Configuration
My HAProxy-powered load balancer (**lb-01**) distributes incoming traffic evenly between **web-01** and **web-02**. To enable this, I configured`haproxy.cfg` at `/etc/haproxy` with the below settings. ⤵️  
```
frontend eke_front
    bind *:80
    mode http
    default_backend eke_back

frontend eke_front_secured
    bind *:443 ssl crt /etc/haproxy/certs/www.chiagoziem.tech.pem
    http-request redirect scheme https code 301 unless { ssl_fc }
    default_backend eke_back

backend eke_back
    balance roundrobin
    server 6414-web-01 3.93.240.46:80 check
    server 6414-web-02 54.227.209.123:80 check
```
From my above configuration, the frontend (`eke_front`) listens on port 80 (HTTP) and forwards all requests to the backend (`eke_back`). The secure frontend (`eke_front_secured`) operates on port 443 (HTTPS) with an SSL certificate stored at `/etc/haproxy/certs/www.chiagoziem.tech.pem`, redirecting HTTP traffic to HTTPS for secure communication before forwarding it to the backend. Lastly, I configured the backend (`eke_back`) to use the `round robin` algorithm to distribute requests evenly between web-01 and web-02, While `check` ensures HAProxy verifies server availability before routing traffic.
