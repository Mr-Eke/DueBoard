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
## Deployment
I deployed **DueBoard** on two Amazon EC2 web servers (web-01 and web-02) that serve the application via NGINX. I also have a load balancer server (lb-01) mapped to the domain www.chiagoziem.tech via A record which I configured to distributes traffic evenly across web-01 and web-02 using HAProxy.  
### Web Servers Setup
- **NGINX Configuration on web-01 and web-02:**
  - Plced My application files in this directory ```/var/www/dueboard``` and below is a server block I configured on Nginx to serve requests for dueboard app
  
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
## Load Balancer Configuration
My HAProxy-powered load balancer (**lb-01**) distributes incoming traffic evenly between **web-01** and **web-02**. To enable this, I configured`haproxy.cfg` at `/etc/haproxy` with the below settings. ⤵️  
```
frontend eke_front_http
    bind *:80
    mode http
    http-request redirect scheme https code 301 location https://www.chiagoziem.tech

frontend eke_front_secured
    bind *:443 ssl crt /etc/haproxy/certs/www.chiagoziem.tech.pem
    mode http
    http-request set-header X-Forwarded-Proto https
    acl is_non_www hdr(host) -i chiagoziem.tech
    http-request redirect prefix https://www.chiagoziem.tech code 301 if is_non_www
    http-response set-header Strict-Transport-Security "max-age=6048000; includeSubDomains"
    default_backend eke_back

backend eke_back
    mode http
    balance roundrobin
    server 6414-web-01 3.93.240.46:80 check
    server 6414-web-02 54.227.209.123:80 check
```
  - **Configuration Details:**
    - **frontend eke_front_http (Handles unsecured traffic)**:
    - I configured haproxy to listen on port 80 for HTTP traffic and then automatically redirect it to the secure HTTPS version, ensuring users always access the site via the secured domain.  
    - **frontend eke_front_secured:**
      - This block listens on the secured port 443 and handles SSL termination using my domain certificate stored in `/etc/haproxy/certs/www.chiagoziem.tech.pem` from letsEncript.  
      - I also enforced www prefix by redirecting the naked domain (chiagoziem.tech) requests.
      - Added this directive `http-response set-header Strict-Transport-Security "max-age=31536000"` for HAProxy to add the HSTS header to HTTP responses, instructing browsers to enforce HTTPS-only connections for the specified duration (in my case, less than 90 days (countdown to the expiry of my SSL cert from certbot), defined by max-age=31536000)
    - Finally, the backend uses a round-robin algorithm to distribute traffic between web-01 and web-02.
### Validate Load Balancer
The screenshot below shows which web server handles each request. The left image captures a request for the load balancer's IP, while the right image shows one for the domain name. Look at the red arrow, which highlights the `X-Served-By` header and indicates the active server at that moment.
  
![Image](https://github.com/user-attachments/assets/956e88fd-9ea5-4088-a40b-a1c07d7ce9e0)
