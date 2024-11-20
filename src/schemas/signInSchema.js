import {z} from 'zod';
import { usernameValidation } from './signUpSchema';

export const signInSchema = z.object({
    identifier: z.string(),
    password: z.string()
}) 