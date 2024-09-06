import { useState } from "react";
import { Controller, FieldPath, FieldValues, useForm } from "react-hook-form";
import { faPlus, faUserSecret } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import {
	Button,
	EmptyState,
	FormControl,
	Input,
	Modal,
	ModalContent,
	Select,
	SelectItem,
	Table,
	TableContainer,
	Td,
	Th,
	THead,
	Tr,
} from "@app/components/v2";
import { usePopUp, UsePopUpReturn, UsePopUpState } from "@app/hooks/usePopUp";

enum CredentialKind {
	login = "Login",
	creditCard = "Credit Card",
	secureNote = "Secure Note"
}

type CreateCredentialModalProps = {
	popUp: UsePopUpState<["credential"]>,
	handlePopUpToggle: UsePopUpReturn<CredentialsPopup>["handlePopUpToggle"];
}

const schema = yup.object({
	kind: yup.mixed().oneOf(Object.values(CredentialKind)).required(),
	name: yup.string().required(),

	// Secure Note
	note: yup.string().when("kind", {
		is: CredentialKind.secureNote,
		then: yup.string().required(),
		otherwise: yup.string().notRequired(),
	}),

	// Login
	url: yup.string().when("kind", {
		is: CredentialKind.creditCard,
		then: yup.string().required(),
		otherwise: yup.string().notRequired(),
	}),

	username: yup.string().when("kind", {
		is: CredentialKind.login,
		then: yup.string().required(),
		otherwise: yup.string().notRequired(),
	}),

	password: yup.string().when("kind", {
		is: CredentialKind.login,
		then: yup.string().required(),
		otherwise: yup.string().notRequired(),
	}),


	// Credit card
	cardNumber: yup.string().when("kind", {
		is: CredentialKind.creditCard,
		then: yup.string().required(),
		otherwise: yup.string().notRequired(),
		// some people might enter spaces in their credit card numbers.
	}).transform(v => v.replaceAll(" ", "d")),

	expiry: yup.date().when("kind", {
		is: CredentialKind.creditCard,
		then: yup.date().default(new Date()).required(),
		otherwise: yup.date().notRequired(),
	}),

	cvv: yup.string().when("kind", {
		is: CredentialKind.creditCard,
		then: yup.string().length(3).matches(/\d{3}/).required(),
		otherwise: yup.string().notRequired(),
	}),
}).required();

export type FormData = yup.InferType<typeof schema>;

type Control<T extends FieldValues> = ReturnType<typeof useForm<T>>["control"]

function FormInputField({ control, name, label, placeholder, type = "text" }: {
	control: Control<FormData>,
	name: FieldPath<FormData>,
	label: string,
	type?: string,
	placeholder?: string
}) {
	return <Controller
		control={control}
		name={name}
		defaultValue=""
		render={({ field, fieldState: { error } }) =>
		(<FormControl
			className="mt-4"
			label={label}
			isError={Boolean(error)}
			errorText={error?.message}
		>
			<Input {...field} type={type} placeholder={placeholder} />
		</FormControl>)
		} />
}

function CreditCardFields({ control }: { control: Control<FormData> }) {
	return (
		<>
			<FormInputField control={control} name="cardNumber" label="Card Number" placeholder="1234-XXXX-XXXX-XXXX" />
			<FormInputField control={control} name="cvv" label="CVV" placeholder="000" />
			<FormInputField control={control} name="expiry" label="Expiry Date" type="date" />
		</>
	);
}

function LoginFields({ control }: { control: Control<FormData> }) {
	return (
		<>
			<FormInputField control={control} name="username" label="Username" placeholder="example@email.com" />
			<FormInputField control={control} name="password" label="Password" type="password" />
		</>
	);
}

function CreateCredentialModal({ popUp, handlePopUpToggle }: CreateCredentialModalProps) {
	const [credentialKind, setCredentialKind] = useState(
		CredentialKind.login
	);

	const {
		control,
		handleSubmit,
		reset,
		// formState: { isSubmitting }
		setValue,
	} = useForm<FormData>({
		resolver: yupResolver(schema),
	});

	const onFormSubmit = async () => {
		// TODO
	}

	return <Modal
		isOpen={popUp.credential.isOpen}
		onOpenChange={(isOpen) => {
			handlePopUpToggle("credential", isOpen);
			reset({ kind: credentialKind });
		}}
	>
		<ModalContent title="Create Credential" >
			<form onSubmit={handleSubmit(onFormSubmit)}>
				<FormInputField
					control={control}
					name="name"
					label="Name"
					placeholder="Example login" />

				<Controller
					control={control}
					name="kind"
					defaultValue={credentialKind}
					render={({ field: { onChange, ...field }, fieldState: { error } }) => (
						<FormControl
							label="Credential Kind"
							errorText={error?.message}
							isError={Boolean(error)}
							className="mt-4"
						>
							<Select
								defaultValue={field.value}
								{...field}
								onValueChange={(value) => {
									onChange(value);
									setValue("kind", value);
									setCredentialKind(value as CredentialKind);
								}}
								className="w-full"
							>
								{Object.values(CredentialKind).map((name) => (
									<SelectItem value={name} key={`st-role-${name}`}>
										{name}
									</SelectItem>
								))}
							</Select>
						</FormControl>
					)}
				/>

				{
					(() => {
						switch (credentialKind) {
							case CredentialKind.login:
								return <LoginFields control={control} />
							case CredentialKind.creditCard:
								return <CreditCardFields control={control} />
							case CredentialKind.secureNote:
								return <FormInputField control={control} name="note" label="Note" />
							default:
								// We've covered all cases, but for some reason,
								// TypeScript doesn't do an exhaustiveness check for that.
								console.error("impossible switch case arm")
								return null;
						}
					})()
				}


				<div className="flex items-center">
					<Button
						className="mr-4"
						size="sm"
						type="submit"
						isLoading={false}
						isDisabled={false}
					>
						Save
					</Button>

					<Button
						colorSchema="secondary"
						variant="plain"
						onClick={() => handlePopUpToggle("credential", false)}
					>
						Cancel
					</Button>
				</div>
			</form>
		</ModalContent>
	</Modal >
}

function CredentialsTable() {
	const credentials: Credential[] = [];

	return (
		<TableContainer>
			<Table>
				<THead>
					<Tr>
						<Th>Name</Th>
						<Th>Type</Th>
					</Tr>
				</THead>

				{credentials.length === 0 ? (
					<Tr>
						<Td colSpan={2}>
							<EmptyState
								title="No credentials have been added so far"
								icon={faUserSecret}
							/>
						</Td>
					</Tr>
				) : null}
			</Table>
		</TableContainer>
	);
}

function CredentialsView({ handlePopUpOpen }: { handlePopUpOpen: UsePopUpReturn<CredentialsPopup>["handlePopUpOpen"] }) {
	return (
		<div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4 w-full">
			<div className="mb-4 flex justify-between">
				<p className="text-xl font-semibold text-mineshaft-100">Identities</p>
				<div className="flex w-full justify-end pr-4" />
				<Button
					colorSchema="primary"
					type="submit"
					leftIcon={<FontAwesomeIcon icon={faPlus} />}
					onClick={() => handlePopUpOpen("credential")}
					isDisabled={false}
				>
					New Credential
				</Button>
			</div>
			<CredentialsTable />
		</div>
	);
}


type CredentialsPopup = ["credential"]

export function UserCredentialsPage() {
	const { popUp,
		handlePopUpOpen,
		// handlePopUpClose, 
		handlePopUpToggle
	} = usePopUp<CredentialsPopup>(["credential"]);

	return (
		<div>
			<div className="full w-full bg-bunker-800 text-white">
				<div className="w-full max-w-7xl">
					<div className="mb-6 text-lg text-mineshaft-300">
						Store and manage credentials like API keys, passwords, and credit card data.
					</div>
				</div>

				<CredentialsView
					handlePopUpOpen={handlePopUpOpen}
				/>
				<CreateCredentialModal
					popUp={popUp}
					handlePopUpToggle={handlePopUpToggle}
				/>
			</div>
		</div>
	);
}
