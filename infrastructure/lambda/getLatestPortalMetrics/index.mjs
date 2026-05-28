import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
const client = new LambdaClient({ region: "eu-west-1" });
let response = {
  statusCode: 200,
  body: JSON.stringify({ message: "Testing" }),
};

export const handler = async (event) => {
  return response;
};
