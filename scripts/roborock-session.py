"""Sign in via email and write the Worker secret to a pipe."""

import asyncio
import json
import logging
import sys
from getpass import getpass

from roborock.web_api import RoborockApiClient


async def connect():
    email = getpass("Roborock account email: ").strip()
    if not email:
        raise SystemExit("Enter the email linked to the Roborock app.")
    client = RoborockApiClient(username=email)
    await client.request_code_v4()
    session = await client.code_login_v4(getpass("Code from Roborock email: ").strip())
    home = await client.get_home_data_v3(session)
    q7_models = {product.id for product in home.products if product.model == "roborock.vacuum.sc01"}
    devices = [
        device for device in home.get_all_devices()
        if device.product_id in q7_models
    ]
    if len(devices) != 1:
        raise SystemExit("Expected one Q7 L5+ in the default Roborock home.")
    rriot = session.rriot
    return {
        "origin": rriot.r.a.rstrip("/"),
        "homeId": str(home.id),
        "deviceId": devices[0].duid,
        "user": rriot.u,
        "secret": rriot.s,
        "signingKey": rriot.h,
    }


if __name__ == "__main__":
    if not sys.stdin.isatty() or sys.stdout.isatty():
        raise SystemExit("Run this from a terminal with stdout piped to pbcopy or gh secret set.")
    logging.disable(logging.CRITICAL)
    try:
        result = json.dumps(asyncio.run(connect()), separators=(",", ":"))
    except Exception as error:
        raise SystemExit(f"Roborock setup failed ({type(error).__name__}).") from None
    sys.stdout.write(result)
