import React, { useState } from 'react';
import { useWorkspace } from '../../contexts/workspace';
import { getKeyValue } from '../../utils';
import { Input, InputGroup, InputRightElement } from '@chakra-ui/input';
import { Button } from '@chakra-ui/button';
import { Box, Flex, Text } from '@chakra-ui/layout';
import { FaPaste } from 'react-icons/fa';

interface CreateSecretFormProps {
  // Add props type here
}

const CreateSecretForm: React.FC<CreateSecretFormProps> = () => {
  const { currentWorkspace } = useWorkspace();
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const delimitters = [":", "="];
    const pastedContent = e.clipboardData.getData('text');
    let { key: pastedKey, value: pastedValue } = getKeyValue(pastedContent, delimitters);
    if (currentWorkspace?.autoCapitalization) {
      pastedKey = pastedKey.toUpperCase();
    }
    setKey(pastedKey);
    setValue(pastedValue);
  };

  // Rest of the code remains the same
};

export default CreateSecretForm;