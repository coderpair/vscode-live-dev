
import { Request } from "express"
import { appSettings } from "./appsettings"
import { adminAuthenticated, disableServer} from "./http"
import { hash } from "./util"

interface Environment {
  server_disabled: number;
  collaboration: number;
}

const env: Environment = {
  server_disabled: 0,
  collaboration: 0
}

/**
 * Provide update information.
 */
export class DashboardProvider {

  public constructor(
    
  ) {}

   /**
     * Try logging in. On failure, show the login page with an error.
     */
    public handlePost(req: Request): any {
      try {
          let response = {};
          //console.log(req.body);
          if(!appSettings.ref){
            response = {content:{
              err:'Not permitted. Firebase not initialized.'}
            };
          }else if(req.body.form_id=="1") {
              const admin = adminAuthenticated(req, {
                  key: typeof req.body.admin === "string" ? hash(req.body.admin) : undefined
              });
              if(admin){
                  response = this.processCollaboration(req);
              }else{
                  response = {content:{
                      admin:0}
                  };
              }
              //console.log(response);
          }
          return response
      } catch (error) {
        return {content:{
          err:'An unknown error occurred.'}
        }
      }
    }
    
    private processCollaboration(req:Request): any {
        const disable = (req.body.disable=="on"?1:0);
        const collaboration = (req.body.collaboration=="on"?1:0);
        const reset1 = (req.body.reset1=="on"?1:0);
       
        if(collaboration != env.collaboration || reset1 == 1 || disable != env.server_disabled){
                disableServer();
                if(appSettings.ref){
                  const ref:any = appSettings.ref;
                  if (ref)
                    ref.remove()
                }
                appSettings.disabled = true;
        } //turn off
        env.server_disabled = disable;
        env.collaboration = collaboration;
        appSettings.useCollaboration = env.collaboration?true:false;
        if(env.server_disabled==0){
           appSettings.disabled = false;
        }
        let response = {content:{
            admin:1,
            collab:env.collaboration,
            reset:reset1,
            disable:env.server_disabled}
        };
        return response
    }

  
}
