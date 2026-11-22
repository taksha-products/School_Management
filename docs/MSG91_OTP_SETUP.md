# MSG91 OTP setup (free trial)

Parent login already generates + verifies OTP in Redis. MSG91 only **delivers** the SMS.

## 1. MSG91 panel

1. Sign up / log in at [control.msg91.com](https://control.msg91.com).
2. **Authkey** → Create New → copy the key.  
   - For the server/VM, either whitelist that machine’s public IP or turn off IP security on the authkey while testing.
3. Open **OTP** → create an OTP template.  
   - Content must include the OTP placeholder (usually `##OTP##`).  
   - Example: `Your EduNex login OTP is ##OTP##. Do not share this code.`  
   - Copy the **Template ID**.
4. (India production later) Complete **DLT** + approved **Sender ID**. Trial often works with MSG91’s default sender for testing.

## 2. Backend env

On the machine that runs the API (local or `edunex.taaksha.com`):

```env
MSG91_AUTH_KEY=your_authkey_here
MSG91_TEMPLATE_ID=your_template_id_here
MSG91_SENDER_ID=EDUNEX

# Keep true until SMS delivery is confirmed on a real phone
OTP_DEBUG=true
```

Restart the backend after changing env.

SMS is **MSG91 only** (Twilio removed). For local without keys: `SMS_PROVIDER=console`.

## 3. Test

1. Request OTP from the parent app with a registered phone.
2. You should receive the SMS; with `OTP_DEBUG=true` the code also appears on screen.
3. When SMS is reliable, set `OTP_DEBUG=false` and redeploy.

## 4. Troubleshooting

| Symptom | Check |
| --- | --- |
| Still see only Dev OTP / server log | `MSG91_*` missing or backend not restarted |
| MSG91 error / auth | Wrong authkey, or IP not whitelisted |
| Template error | Template ID wrong, or variable name not `OTP` / `##OTP##` |
| No SMS on phone (India) | Trial limits, DLT/sender not ready — keep `OTP_DEBUG=true` for now |
