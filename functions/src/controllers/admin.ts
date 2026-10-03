import type {Response} from "express";
import type {AuthedRequest} from "../middlewares";
import {listStaff} from "../stores/staff";

export async function getStaffDirectory(
  _request: AuthedRequest,
  response: Response
): Promise<void> {
  const staff = await listStaff();
  response.status(200).json({staff});
}
