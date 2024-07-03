import React, { useEffect, useState } from "react";
import ReactCardFlip from "react-card-flip";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid";

import { createNotification } from "@app/components/notifications";
import { useDeleteConsumerSecret, useGetConsumerSecrets } from "@app/hooks/api/consumerSecrets";

import { AddSecretModal } from "./AddSecretModal";
import { decryptData } from "./encryptionUtil";

interface Secret {
  id: string;
  type: string;
  title: string;
  username?: string;
  password?: string;
  cardNumber?: string;
  expiryDate?: string;
  cvv?: string;
  content?: string;
}

interface SecretCardProps {
  item: Secret;
  isFlipped: boolean;
  handleClick: () => void;
  handleEdit: (secret: Secret) => void;
  handleDelete: () => void;
}

// Utility functions defined before usage
const cleanTypeName = (name: string): string => {
  return name
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const capitalizeWords = (str: string): string => {
  return str
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const SecretCard = ({ item, isFlipped, handleClick, handleEdit, handleDelete }: SecretCardProps) => {
  const cardContainerStyle = {
    width: "250px",
    height: "250px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    borderRadius: "10px",
    textAlign: "center",
    padding: "10px"
  };

  const cardContainerStyleFront = { ...cardContainerStyle, backgroundColor: "#333", color: "#fff" };
  const cardContainerStyleBack = { ...cardContainerStyle, backgroundColor: "#fff", color: "#333" };

  const tableStyle = { borderCollapse: "collapse" as const, width: "100%", borderStyle: "hidden" };
  const tdStyle = { padding: "8px", border: "1px solid #333" };
  const leftTdStyle = { ...tdStyle, textAlign: "left" as const };
  const rightTdStyle = { ...tdStyle, textAlign: "right" as const };

  const renderBackContent = (secret: Secret) => {
    const editableFields: { [key: string]: string[] } = {
      "web-login": ["username", "password"],
      "credit-card": ["cardNumber", "expiryDate", "cvv"],
      "secure-note": ["title", "content"]
    };

    const decryptFields = ["password", "cvv", "cardNumber", "content"];

    return (
      <Box sx={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {secret.type !== "secure-note" ? (
          <table style={tableStyle}>
            <tbody>
              {editableFields[secret.type].map((field) => (
                <tr key={field}>
                  <td style={leftTdStyle}>{capitalizeWords(field)}</td>
                  <td style={rightTdStyle}>
                    {decryptFields.includes(field) ? decryptData(secret[field as keyof Secret] || "") : secret[field as keyof Secret]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{
            width: "100%",
            height: "100%",
            margin: 0,
            overflowY: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxSizing: "border-box",
            padding: "10px",
            wordBreak: "break-word"
          }}>
            {decryptData(secret.content || "")}
          </p>
        )}
        <EditIcon
          onClick={(e) => {
            e.stopPropagation();
            handleEdit(secret);
          }}
          style={{ cursor: "pointer", position: "absolute", bottom: 8, left: 8 }}
        />
      </Box>
    );
  };

  return (
    <ReactCardFlip isFlipped={isFlipped} flipDirection="horizontal">
      <Card onClick={handleClick} sx={{ borderRadius: "10px", backgroundColor: "#333" }}>
        <CardContent sx={cardContainerStyleFront}>
          <Box key="front">
            <p style={{ fontWeight: "bold" }}>{item.title || "No Title"}</p>
            <p>{cleanTypeName(item.type)}</p>
            <DeleteIcon sx={{ position: "absolute", bottom: 8, right: 8 }} onClick={handleDelete} />
          </Box>
        </CardContent>
      </Card>
      <Card onClick={handleClick} sx={{ borderRadius: "10px", backgroundColor: "#333" }}>
        <CardContent sx={cardContainerStyleBack}>
          <Box key="back">{renderBackContent(item)}</Box>
        </CardContent>
      </Card>
    </ReactCardFlip>
  );
};

export const ConsumerSecretList = () => {
  const { data: secrets, refetch } = useGetConsumerSecrets();
  const [flippedCards, setFlippedCards] = useState<{ [key: string]: boolean }>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalData, setModalData] = useState<Secret | null>(null);
  const deleteConsumerSecret = useDeleteConsumerSecret();

  useEffect(() => {
    if (secrets) {
      const initialState: { [key: string]: boolean } = {};
      secrets.forEach((secret) => {
        initialState[secret.id] = false;
      });
      setFlippedCards(initialState);
    }
  }, [secrets]);

  const handleClick = (id: string) => {
    setFlippedCards((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleEdit = (secret: Secret) => {
    const decryptedSecret = {
      ...secret,
      id: secret.id,
      password: secret.password ? decryptData(secret.password) : undefined,
      cardNumber: secret.cardNumber ? decryptData(secret.cardNumber) : undefined,
      cvv: secret.cvv ? decryptData(secret.cvv) : undefined,
      content: secret.content ? decryptData(secret.content) : undefined,
    };

    setModalData(decryptedSecret);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteConsumerSecret.mutateAsync({ consumerSecretId: id });
      refetch();
      createNotification({
        text: "Successfully deleted the consumer secret",
        type: "success"
      });
    } catch (error) {
      createNotification({
        text: "Failed to delete the consumer secret",
        type: "error"
      });
    }
  };

  const handleAddClick = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setModalData(null);
  };

  return (
    <>
      <Box sx={{ padding: "20px" }}>
        <Grid container spacing={2} justifyContent="center">
          <Grid item>
            <Card sx={{ width: "250px", height: "250px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", backgroundColor: "#E0ED34" }} onClick={handleAddClick}>
              <CardContent>
                <Box sx={{ fontSize: "4rem", textAlign: "center" }}>+</Box>
              </CardContent>
            </Card>
          </Grid>
          {secrets?.map((secretItem) => ( 
            <Grid item key={secretItem.id}>
              <SecretCard
                item={secretItem}
                isFlipped={flippedCards[secretItem.id]}
                handleClick={() => handleClick(secretItem.id)}
                handleEdit={() => handleEdit(secretItem)}
                handleDelete={() => handleDelete(secretItem.id)}
              />
            </Grid>
          ))}
        </Grid>
      </Box>
      <AddSecretModal isOpen={isModalOpen} onClose={handleCloseModal} initialData={modalData} />
    </>
  );
};
