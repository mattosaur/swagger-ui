import win from "core/window"
import { btoa, buildFormData } from "core/utils"

export const SHOW_AUTH_POPUP = "show_popup"
export const AUTHORIZE = "authorize"
export const LOGOUT = "logout"
export const PRE_AUTHORIZE_OAUTH2 = "pre_authorize_oauth2"
export const AUTHORIZE_OAUTH2 = "authorize_oauth2"
export const VALIDATE = "validate"

const scopeSeparator = " "

export function showDefinitions(payload) {
  return {
    type: SHOW_AUTH_POPUP,
    payload: payload
  }
}

export function authorize(payload) {
  return {
    type: AUTHORIZE,
    payload: payload
  }
}

export function logout(payload) {
  return {
    type: LOGOUT,
    payload: payload
  }
}

export const preAuthorizeImplicit = (payload) => ( { authActions, errActions } ) => {
  let { auth , token, isValid } = payload
  let { schema, name } = auth
  let flow = schema.get("flow")

  // remove oauth2 property from window after redirect from authentication
  delete win.swaggerUIRedirectOauth2

  if ( flow !== "accessCode" && !isValid ) {
    errActions.newAuthErr( {
      authId: name,
      source: "auth",
      level: "warning",
      message: "Authorization may be unsafe, passed state was changed in server Passed state wasn't returned from auth server"
    })
  }

  if ( token.error ) {
    errActions.newAuthErr({
      authId: name,
      source: "auth",
      level: "error",
      message: JSON.stringify(token)
    })
    return
  }

  authActions.authorizeOauth2({ auth, token })
}

export function authorizeOauth2(payload) {
  return {
    type: AUTHORIZE_OAUTH2,
    payload: payload
  }
}

export const authorizePassword = ( auth ) => ( { fn, authActions, errActions } ) => {
  let { schema, name, username, password, passwordType, clientId, clientSecret } = auth
  let form = {
    grant_type: "password",
    scopes: encodeURIComponent(auth.scopes.join(scopeSeparator))
  }
  let query = {}
  let headers = {}

  if ( passwordType === "basic") {
    headers.Authorization = "Basic " + btoa(username + ":" + password)
  } else {
    Object.assign(form,  {username}, {password})
    if ( passwordType === "query") {
      if ( clientId ) { query.client_id = clientId }
      if ( clientSecret ) { query.client_secret = clientSecret }
    } else {
      Object.assign(form, {client_id: clientId}, {client_secret: clientSecret})
    }
  }

  return authActions.authorizeRequest({ body: buildFormData(form), url: schema.get("tokenUrl"), name, headers, query, auth})
}

export const authorizeApplication = ( auth ) => ( { fn, authActions, errActions } ) => {
  let { schema, scopes, name, clientId, clientSecret } = auth
  let form = {
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: scopes.join(scopeSeparator)
  }

  return authActions.authorizeRequest({body: buildFormData(form), name, url: schema.get("tokenUrl"), auth })
}

export const authorizeAccessCode = ( auth ) => ( { fn, authActions } ) => {
 let { schema, name, clientId, clientSecret } = auth
 let form = {
   grant_type: "authorization_code",
   code: auth.code,
   client_id: clientId,
   client_secret: clientSecret
 }

 return authActions.authorizeRequest({body: buildFormData(form), name, url: schema.get("tokenUrl"), auth})

}

export const authorizeRequest = ( data ) => ( { fn, authActions, errActions } ) => {
  let { body, query={}, headers={}, name, url, auth } = data

  let _headers = Object.assign({
    "Accept":"application/json, text/plain, */*",
    "Content-Type": "application/x-www-form-urlencoded"
  }, headers)

  fn.fetch({
    url: url,
    method: "post",
    headers: _headers,
    query: query,
    body: body
  })
    .then(function (response) {
      let token = JSON.parse(response.data)
      let error = token && ( token.error || "" )
      let parseError = token && ( token.parseError || "" )

      if ( !response.ok ) {
        errActions.newAuthErr( {
          authId: name,
          level: "error",
          source: "auth",
          message: response.statusText
        } )
        return
      }

      if ( error || parseError ) {
        errActions.newAuthErr({
          authId: name,
          level: "error",
          source: "auth",
          message: JSON.stringify(token)
        })
        return
      }

      authActions.authorizeOauth2({ auth, token})
    })
    .catch(err => { errActions.newAuthErr( err ) })
}
