![Image](https://github.com/user-attachments/assets/e68b260f-37a1-4a07-919d-be969c52325f)   
  
Helps students stay on top of their assignment deadlines by syncing Canvas assignment events with Google Calendar. The web application presents assignment data in an easy-to-understand format, allowing users to sort, filter, and search assignments. **DueBoard** just ensures you are managing your academic schedules well!
## Features
- [x] **Canvas Calendar Sync:** Automatically sync and read your Canvas calendar events from Google Calendar.
- [x] **Assignment Details:** You can view your assignments with their name, module, description, and countdown until the due date.
- [x] **Sorting & Searching:** Easily sort assignments by their due date, alphabetically, urgent, or search by assignment name or course name based on your criteria.
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
- **Configure API Credentials:**
  - Create a configuration file ```config.js```; create a CONFIG object in the file and add your Google API Key and OAuth Client ID.  
      - ```
        export const CONFIG = {
            client_Id: 'Your_OAuth_client_ID',
            api_key: 'Your_API_Key'
        }
        ```
Go live and open your browser on ```http://localhost:5500``` since port 5500 is the redirect URL in the Google Cloud Console for OAuth.  
## Deployment
**DueBoard** is deployed on two Amazon EC2 web servers (web-01 and web-02) that serve the application via NGINX. A load balancer server (lb-01) maps to the domain www.chiagoziem.tech via A record and distributes traffic evenly across web-01 and web-02 using HAProxy.  
### Web Servers Setup
- **NGINX Configuration on web-01 and web-02:**
  - My application files are placed in this designated directory ```/var/www/dueboard``` and below is a server block I configured on Nginx to serve request for dueboard app
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
My load balancer (lb-01) is powered by HAProxy, which sits in front of web-01 and web-02. HAProxy dynamically routes incoming requests evenly to the 2 web servers. I added the below configurations to my haproxy.cfg to achieve this. ⤵️  
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
