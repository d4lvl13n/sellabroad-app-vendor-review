import { AuthData } from "@saleor/app-sdk/APL";
import { print } from "graphql";
import { DocumentNode } from "graphql";

import {
  TransactionEventReportDocument,
  TransactionEventReportMutation,
  TransactionEventReportMutationVariables,
  CheckoutCompleteDocument,
  CheckoutCompleteMutation,
  CheckoutCompleteMutationVariables,
  UpdatePrivateMetadataDocument,
  UpdatePrivateMetadataMutation,
  UpdatePrivateMetadataMutationVariables,
} from "@/generated/graphql";

type GraphQLResponse<T> = { data?: T; errors?: Array<{ message: string }> };

const saleorFetch = async <T, V>(
  authData: AuthData,
  document: DocumentNode,
  variables: V
): Promise<T> => {
  const query = print(document);

  const response = await fetch(authData.saleorApiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization-bearer": authData.token,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Saleor API error: ${response.status} ${await response.text()}`);
  }

  const result = (await response.json()) as GraphQLResponse<T>;

  if (result.errors?.length) {
    throw new Error(`Saleor GraphQL errors: ${result.errors.map((e) => e.message).join(", ")}`);
  }

  if (!result.data) {
    throw new Error("Saleor API returned no data");
  }

  return result.data;
};

export const reportTransactionEvent = async (
  authData: AuthData,
  variables: TransactionEventReportMutationVariables
): Promise<TransactionEventReportMutation> =>
  saleorFetch<TransactionEventReportMutation, TransactionEventReportMutationVariables>(
    authData,
    TransactionEventReportDocument as unknown as DocumentNode,
    variables
  );

export const completeCheckout = async (
  authData: AuthData,
  checkoutId: string
): Promise<CheckoutCompleteMutation> =>
  saleorFetch<CheckoutCompleteMutation, CheckoutCompleteMutationVariables>(
    authData,
    CheckoutCompleteDocument as unknown as DocumentNode,
    { checkoutId }
  );

export const updateOrderPrivateMetadata = async (
  authData: AuthData,
  orderId: string,
  metadata: Array<{ key: string; value: string }>
): Promise<UpdatePrivateMetadataMutation> =>
  saleorFetch<UpdatePrivateMetadataMutation, UpdatePrivateMetadataMutationVariables>(
    authData,
    UpdatePrivateMetadataDocument as unknown as DocumentNode,
    { id: orderId, input: metadata }
  );
